// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import {
  DaemonFrameType,
  decodeDaemonEventFrame,
  RUSHD_GRAPH_SNAPSHOT,
  type IDaemonFrame,
  type IDaemonGraphSnapshotPayload,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import type { IDaemonRequestResolver } from '../DaemonRequestDispatcher';
import { RushDaemonHost } from '../RushDaemonHost';
import { WorkspaceSession } from '../WorkspaceSession';
import { getWorkspaceGenerationToken } from '../WorkspaceGeneration';
import type { GetWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import {
  createWireEnvelope,
  DaemonRequestWireClient,
  type ITerminalExchange
} from './DaemonRequestWireTestUtilities';
import { assertSuccessfulNativeBuild } from './NativeBuildTestResult';
import { removeTestFolderAsync } from './TestProcessExit';

export class DaemonGraphTestFixture implements AsyncDisposable {
  public session!: WorkspaceSession;
  public host!: RushDaemonHost;
  public getSuccessorLaunchAsync: GetWorkspaceSuccessorLaunchAsync | undefined;
  public readonly folder: string = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-graph-'))
  );
  public readonly environment: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined)
    )
  };
  private _nextId: number = 0;
  private _lifecycle: boolean = true;

  public static async createAsync(
    configure?: (fixture: DaemonGraphTestFixture) => void,
    lifecycle: boolean = true,
    signal?: AbortSignal
  ): Promise<DaemonGraphTestFixture> {
    const fixture: DaemonGraphTestFixture = new DaemonGraphTestFixture();
    fixture._lifecycle = lifecycle;
    try {
      signal?.throwIfAborted();
      fixture.write(
        'rush.json',
        JSON.stringify({
          rushVersion: Rush.version,
          npmVersion: '10.0.0',
          // Graph-control assertions must not depend on the surrounding Jest worker's RSS.
          // Warm-policy fixtures explicitly override this budget to exercise real pressure.
          daemon: { warmMemoryBudgetMB: 100_000 },
          projectFolderMinDepth: 1,
          projects: ['a', 'b', 'c'].map((name) => ({ packageName: name, projectFolder: name }))
        })
      );
      fixture.write('.gitignore', 'common/temp/\n**/.rush/\n**/rush-logs/\nruns.txt\n');
      fixture.write('common/temp/last-link.flag', '{}');
      fixture.write('common/config/rush/npm-shrinkwrap.json', '{"lockfileVersion":3,"packages":{}}');
      fixture.write(
        'common/config/rush/command-line.json',
        JSON.stringify({
          phases: [{ name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } }],
          commands: [
            {
              commandKind: 'phased',
              name: 'build',
              phases: ['_phase:compile'],
              incremental: true,
              enableParallelism: true
            }
          ]
        })
      );
      for (const name of ['a', 'b', 'c']) {
        fixture.write(
          `${name}/package.json`,
          JSON.stringify({
            name,
            version: '1.0.0',
            dependencies: name === 'b' ? { a: '1.0.0' } : {},
            scripts: { '_phase:compile': 'node build.cjs' }
          })
        );
        fixture.write(`${name}/input.txt`, 'one');
        fixture.write(
          `${name}/build.cjs`,
          "const fs=require('node:fs');const name=require('./package.json').name;" +
            "fs.appendFileSync('../runs.txt',name+'\\n');console.log('building-'+name);" +
            "setTimeout(()=>console.log('finished-'+name),150);"
        );
      }
      configure?.(fixture);
      signal?.throwIfAborted();
      execFileSync('git', ['init', '--quiet'], { cwd: fixture.folder });
      execFileSync('git', ['config', '--local', 'core.autocrlf', 'false'], { cwd: fixture.folder });
      execFileSync('git', ['add', '.'], { cwd: fixture.folder });
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Graph Test',
          '-c',
          'user.email=graph@example.invalid',
          'commit',
          '--quiet',
          '-m',
          'fixture'
        ],
        { cwd: fixture.folder }
      );
      await fixture._startAsync();
      // Host startup owns its partial resources; join it before disposing a late result.
      signal?.throwIfAborted();
      return fixture;
    } catch (error) {
      try {
        await fixture[Symbol.asyncDispose]();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Failed to initialize and dispose the graph fixture.'
        );
      }
      throw error;
    }
  }

  private async _startAsync(): Promise<void> {
    const resolver: IDaemonRequestResolver = new ProductionDaemonRequestResolver();
    this.host = await RushDaemonHost.startAsync({
      repoRoot: this.folder,
      rushVersion: Rush.version,
      daemonVersion: 'graph-test',
      getSuccessorLaunchAsync: this.getSuccessorLaunchAsync,
      requestResolver: this._lifecycle
        ? resolver
        : {
            resolveRequestAsync: (options) => resolver.resolveRequestAsync(options),
            [Symbol.asyncDispose]: async () => {
              await resolver[Symbol.asyncDispose]?.();
            }
          },
      createWorkspaceSessionAsync: async (options) => {
        this.session = await WorkspaceSession.createAsync(options);
        return this.session;
      }
    });
  }

  public async restartAsync(): Promise<void> {
    await this.host.closeAsync();
    await this._startAsync();
  }

  public write(name: string, text: string): void {
    const filename: string = path.join(this.folder, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, text);
  }

  public runs(): string[] {
    const filename: string = path.join(this.folder, 'runs.txt');
    return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8').trim().split('\n') : [];
  }

  public async connectAsync(): Promise<DaemonRequestWireClient> {
    const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(
      this.host.paths.socketPath
    );
    await client.handshakeAsync();
    return client;
  }

  public envelope(argv: string[], overrides: Partial<IDaemonRequestEnvelope> = {}): IDaemonRequestEnvelope {
    return createWireEnvelope(`graph-${++this._nextId}`, argv[0], this.folder, {
      argv,
      commandOrigin: 'built-in',
      expectedWorkspaceGeneration:
        argv[0] === 'daemon' ? getWorkspaceGenerationToken(this.session) : undefined,
      environment:
        argv[0] === 'daemon' ? { ...this.environment, RUSH_DAEMON_EXPERIMENTAL: '1' } : this.environment,
      terminal: { isTTY: false, supportsColor: false },
      ...overrides
    });
  }

  public async runAsync(
    argv: string[],
    overrides: Partial<IDaemonRequestEnvelope> = {}
  ): Promise<ITerminalExchange> {
    const client: DaemonRequestWireClient = await this.connectAsync();
    const payload: IDaemonRequestEnvelope = this.envelope(argv, overrides);
    try {
      await client.sendControlAsync({ kind: 'requestStart', payload });
      return await client.readTerminalAsync(payload.requestId);
    } finally {
      await client.closeAsync();
    }
  }

  public graphAsync(...argv: string[]): Promise<ITerminalExchange> {
    return this.runAsync(['daemon', 'graph', ...argv]);
  }

  public buildAsync(): Promise<ITerminalExchange> {
    return this.runAsync(['build', '--to', 'b', '--parallelism', '3']);
  }

  public async buildSuccessfullyAsync(): Promise<ITerminalExchange> {
    const exchange: ITerminalExchange = await this.buildAsync();
    assertSuccessfulNativeBuild(exchange, this.session.operationGraph);
    return exchange;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.host?.closeAsync();
    await removeTestFolderAsync(this.folder, true);
  }
}

export function graphSnapshot(frame: IDaemonFrame): IDaemonGraphSnapshotPayload['snapshot'] {
  expect(frame.kind).toBe(DaemonFrameType.event);
  const event = decodeDaemonEventFrame(frame.payload);
  expect(event).toMatchObject({ type: 'extension', payload: { name: RUSHD_GRAPH_SNAPSHOT } });
  const payload = event.payload as { data: IDaemonGraphSnapshotPayload };
  return payload.data.snapshot;
}

export function responseSnapshot(exchange: ITerminalExchange): IDaemonGraphSnapshotPayload['snapshot'] {
  expect(exchange.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
  const events: IDaemonFrame[] = exchange.frames.filter((frame) => frame.kind === DaemonFrameType.event);
  expect(events).toHaveLength(1);
  expect(
    exchange.frames.some(
      (frame) => frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr
    )
  ).toBe(false);
  return graphSnapshot(events[0]);
}
