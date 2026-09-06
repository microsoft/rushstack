// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  RushUserConfiguration,
  type IOperationGraph,
  type IOperationRunner,
  type Operation,
  type RushConfigurationProject
} from '@microsoft/rush-lib';
import type { IIPCOperationRunnerOptions } from '@microsoft/rush-lib/lib/logic/operations/IPCOperationRunner';

import { WorkspaceSessionFileWatcher } from '../WorkspaceSessionFileWatcher';
import { WorkspaceWarmSet, type WorkspaceWarmSetConfiguration } from '../WorkspaceWarmSet';
import { getWorkspaceRequestScheduler } from '../WorkspaceRequestAdmission';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';

// The runtime class is identical; deep .d.ts imports and the public rollup have separate private type identities.
const {
  IPCOperationRunner
}: {
  IPCOperationRunner: new (
    options: Omit<IIPCOperationRunnerOptions, 'project'> & { project: RushConfigurationProject }
  ) => IOperationRunner;
} = require('@microsoft/rush-lib/lib/logic/operations/IPCOperationRunner');

export interface IWarmFixtureOptions {
  readonly ipc?: boolean;
  readonly cache?: boolean;
  readonly configurationKind?: 'direct' | 'rig' | 'inherited';
}

export const GENEROUS_WARM_CONFIGURATION: WorkspaceWarmSetConfiguration = {
  warmIdleTimeoutSeconds: 300,
  warmMemoryBudgetMB: 100_000,
  warmSetMaxProjects: 20,
  autoWarmByTelemetry: false
};

/** Attaches the production controller at the same generation-owned component boundary used by the host. */
export class WarmSetTestFixture implements AsyncDisposable {
  public fixture!: DaemonGraphTestFixture;
  public watcher!: WorkspaceSessionFileWatcher;
  public warm!: WorkspaceWarmSet;
  public readonly diagnostics: Error[] = [];
  public readonly protectedOperations: Set<Operation> = new Set();
  public configuration: WorkspaceWarmSetConfiguration = GENEROUS_WARM_CONFIGURATION;
  private _initializationSpy: jest.SpyInstance | undefined;
  private _cacheFolder: string | undefined;
  private readonly _options: IWarmFixtureOptions;

  private constructor(options: IWarmFixtureOptions) {
    this._options = options;
  }

  public static async createAsync(options: IWarmFixtureOptions = {}): Promise<WarmSetTestFixture> {
    const result: WarmSetTestFixture = new WarmSetTestFixture(options);
    const userConfiguration: RushUserConfiguration = await RushUserConfiguration.initializeAsync();
    await result._captureWatcherAsync(async () => {
      result.fixture = await DaemonGraphTestFixture.createAsync((fixture) => {
        fixture.write(
          '.gitignore',
          'common/temp/\n**/.rush/\n**/rush-logs/\n**/lib/\n**/node_modules/\nruns.txt\n'
        );
        if (options.cache) {
          const namespace: string = path.basename(fixture.folder);
          fixture.write(
            'common/config/rush/build-cache.json',
            JSON.stringify({
              buildCacheEnabled: true,
              cacheProvider: 'local-only',
              cacheEntryNamePattern: `${namespace}/[hash]`
            })
          );
          result._cacheFolder = path.join(
            userConfiguration.buildCacheFolder ?? path.join(fixture.folder, 'common/temp/build-cache'),
            namespace
          );
        }
        for (const name of ['a', 'b', 'c']) {
          fixture.write(
            `${name}/config/rush-project.json`,
            JSON.stringify({
              operationSettings: [{ operationName: '_phase:compile', outputFolderNames: ['lib'] }]
            })
          );
          fixture.write(`${name}/build.cjs`, createScript(name, options.ipc ?? false));
        }
        if (options.configurationKind === 'rig') {
          fs.unlinkSync(path.join(fixture.folder, 'a/config/rush-project.json'));
          fixture.write('a/config/rig.json', '{"rigPackageName":"fixture-rig"}');
          fixture.write(
            'a/node_modules/fixture-rig/package.json',
            '{"name":"fixture-rig","version":"1.0.0"}'
          );
          fixture.write(
            'a/node_modules/fixture-rig/profiles/default/config/rush-project.json',
            '{"operationSettings":[{"operationName":"_phase:compile","outputFolderNames":["lib"]}]}'
          );
        } else if (options.configurationKind === 'inherited') {
          fixture.write(
            'common/temp/inherited.json',
            '{"operationSettings":[{"operationName":"_phase:compile","outputFolderNames":["lib"]}]}'
          );
          fixture.write('a/config/rush-project.json', '{"extends":"../../common/temp/inherited.json"}');
        }
      });
    });
    result._attachOnInitialization();
    return result;
  }

  public get graph(): IOperationGraph {
    return this.fixture.session.operationGraph!;
  }

  public operation(name: string): Operation {
    const operation: Operation | undefined = [...this.graph.operations].find(
      (candidate) => candidate.associatedProject.packageName === name
    );
    if (!operation) throw new Error(`Unknown fixture operation: ${name}`);
    return operation;
  }

  public update(configuration: WorkspaceWarmSetConfiguration): void {
    this.configuration = { ...GENEROUS_WARM_CONFIGURATION, ...configuration };
    this.warm.updateConfiguration(this.configuration);
  }

  public async restartAsync(): Promise<void> {
    await this.warm[Symbol.asyncDispose]();
    this._initializationSpy?.mockRestore();
    await this._captureWatcherAsync(() => this.fixture.restartAsync());
    this._attachOnInitialization();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.warm?.[Symbol.asyncDispose]();
    this._initializationSpy?.mockRestore();
    try {
      await this.fixture?.[Symbol.asyncDispose]();
    } finally {
      if (this._cacheFolder) fs.rmSync(this._cacheFolder, { recursive: true, force: true });
    }
  }

  private async _captureWatcherAsync(createAsync: () => Promise<void>): Promise<void> {
    const owner: WarmSetTestFixture = this;
    const original = WorkspaceSessionFileWatcher.prototype.startAsync;
    const capture = jest
      .spyOn(WorkspaceSessionFileWatcher.prototype, 'startAsync')
      .mockImplementation(function (
        this: WorkspaceSessionFileWatcher,
        onInvalidation: (changedPath?: string) => void
      ): Promise<void> {
        owner.watcher = this;
        return original.call(this, onInvalidation);
      });
    try {
      await createAsync();
    } finally {
      capture.mockRestore();
    }
  }

  private _attachOnInitialization(): void {
    const { session } = this.fixture;
    const initialize = session.initializeEngineAsync.bind(session);
    this._initializationSpy = jest.spyOn(session, 'initializeEngineAsync').mockImplementation((factory) =>
      initialize(async (options) => {
        const components = await factory(options);
        const graph: IOperationGraph = components.operationGraph!;
        if (this._options.ipc) {
          // Use the real native IPC runner with the fixture's explicitly requested script. The default
          // non-watch production resolver intentionally still selects shell runners.
          for (const operation of graph.operations) {
            operation.runner = new IPCOperationRunner({
              name: operation.name,
              phase: operation.associatedPhase,
              project: operation.associatedProject,
              initialCommand: 'node build.cjs',
              incrementalCommand: 'node build.cjs',
              commandForHash: 'node build.cjs',
              ignoredParameterValues: []
            });
          }
        }
        this.warm = WorkspaceWarmSet.attach({
          operationGraph: graph,
          configuration: this.configuration,
          scheduler: getWorkspaceRequestScheduler(session),
          acquireExecutionLeaseAsync: () => session.acquireExecutionLeaseAsync(),
          watcher: this.watcher,
          getProtectedOperations: () => this.protectedOperations,
          onDiagnostic: (error) => this.diagnostics.push(error)
        });
        return components;
      })
    );
  }
}

function createScript(name: string, ipc: boolean): string {
  const operationGraphPath: string = require.resolve('@rushstack/operation-graph', {
    paths: [path.dirname(require.resolve('@microsoft/rush-lib/package.json'))]
  });
  const execute: string = `
    const fs = require('node:fs');
    const name = ${JSON.stringify(name)};
    let runs = 0;
    async function build() {
      const gate = '../common/temp/gate-' + name + '.json';
      if (fs.existsSync(gate)) {
        const { port } = JSON.parse(fs.readFileSync(gate, 'utf8'));
        await new Promise((resolve, reject) => {
          const socket = require('node:net').connect(port, '127.0.0.1');
          socket.once('error', reject);
          socket.once('data', () => { socket.end(); resolve(); });
        });
      }
      if (${ipc} && name === 'a' && runs === 0) await new Promise(resolve => setTimeout(resolve, 500));
      runs++;
      const input = fs.readFileSync('input.txt', 'utf8');
      fs.appendFileSync('../runs.txt', name + '\\n');
      fs.mkdirSync('lib', { recursive: true });
      fs.writeFileSync('lib/output.txt', input);
      console.log('built-' + name + '-' + input);
      if (input === 'warning') console.error('warning-' + name);
      return input === 'failure' ? 'FAILURE' : 'SUCCESS';
    }
  `;
  return (
    execute +
    (ipc
      ? `
    const { WatchLoop } = require(${JSON.stringify(operationGraphPath)});
    const loop = new WatchLoop({
      executeAsync: build, onBeforeExecute() {}, onRequestRun() {}, onAbort() {}
    });
    loop.runIPCAsync().then(async () => {
      const delayFile = '../common/temp/close-delay-' + name;
      if (fs.existsSync(delayFile)) await new Promise(resolve => setTimeout(resolve, 100));
      fs.writeFileSync('../common/temp/closed-' + name, String(process.pid));
    }).catch(error => { console.error(error); process.exitCode = 1; })
      .finally(() => process.disconnect());
  `
      : `
    build().then(status => { if (status === 'FAILURE') process.exitCode = 7; })
      .catch(error => { console.error(error); process.exitCode = 1; });
  `)
  );
}
