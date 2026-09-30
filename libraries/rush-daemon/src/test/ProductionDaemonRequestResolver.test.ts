// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  PhasedCommandEngine,
  RushProjectConfiguration,
  type IOperationGraph,
  type IPhasedCommandEngine,
  type ITelemetryData,
  type Operation,
  type RushConfigurationProject
} from '@microsoft/rush-lib';
import type { LockFile } from '@rushstack/node-core-library';
import {
  DaemonFrameType,
  decodeDaemonEventFrame,
  type IDaemonPhasedRequestResult
} from '@rushstack/rush-daemon-protocol';
import { NoOpTerminalProvider, Terminal, TerminalProviderSeverity } from '@rushstack/terminal';
import { StandardScriptUpdater } from '@microsoft/rush-lib/lib/logic/StandardScriptUpdater';
import { RushConfiguration as InternalRushConfiguration } from '@microsoft/rush-lib/lib/api/RushConfiguration';

import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import type { WorkspaceSession } from '../WorkspaceSession';
import { stopSuccessorAsync } from './WorkspaceLifecycleTestProcess';
import { readDaemonLockfile } from '@rushstack/rush-daemon-transport';
import { EngineTerminalProvider } from '../EngineTerminalProvider';
import { DaemonShutdownError } from '../DaemonShutdownError';
import { getInstalledWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import type { IWorkspaceProcessRestartResult } from '../WorkspaceProcessRestart';
import type { IResolveDaemonRequestOptions, ResolvedDaemonRequest } from '../DaemonRequestDispatcher';
import { PhasedRequestRouter } from '../PhasedRequestRouter';
import type { IRequestLease } from '../RequestScheduler';
import { RequestAdmissionController } from '../WorkspaceRequestAdmission';
import { TestPhasedRequestClient } from './PhasedRequestRouterTestUtilities';
import {
  createNativeScriptGateAsync,
  runNativeCommandAsync,
  type INativeCommandResult,
  type INativeScriptGate
} from './NativeEngineTestCommands';
import {
  DaemonRequestWireClient,
  createDeferred,
  createWireEnvelope,
  type IDeferred,
  type ITerminalExchange
} from './DaemonRequestWireTestUtilities';
import {
  createFixtureAsync,
  DecoratedTestResolver,
  logText,
  readTelemetryEntries,
  requestEnvironment,
  runAsync,
  runs,
  type IFixture
} from './NativeEngineTestFixture';

jest.setTimeout(30_000);

describe('native production daemon engine', () => {
  it("runs each request's operations with its requester's session and invocation folder", async () => {
    const fixture: IFixture = await createFixtureAsync();
    const recordFile: string = path.join(fixture.repoRoot, 'common/temp/operation-environment.txt');
    const projectFolder: string = path.join(fixture.repoRoot, 'projects/a');
    const daemonSession: string | undefined = process.env.COPILOT_AGENT_SESSION_ID;
    // This in-process host's own value stands in for the session that started the daemon.
    process.env.COPILOT_AGENT_SESSION_ID = 'daemon-starter';
    try {
      fs.writeFileSync(recordFile, '');
      const requests: ReadonlyArray<readonly [string, string | undefined, string]> = [
        ['first-a', 'session-A', fixture.repoRoot],
        ['then-b', 'session-B', projectFolder],
        ['again-a', 'session-A', fixture.repoRoot],
        ['unset', undefined, fixture.repoRoot]
      ];
      for (const [requestId, session, cwd] of requests) {
        const environment: Record<string, string> = requestEnvironment();
        delete environment.COPILOT_AGENT_SESSION_ID;
        if (session !== undefined) environment.COPILOT_AGENT_SESSION_ID = session;
        const exchange: ITerminalExchange = await runAsync(fixture, requestId, ['rebuild', '--only', 'a'], {
          cwd,
          environment
        });
        expect(exchange.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      }
      const records: unknown[] = fs
        .readFileSync(recordFile, 'utf8')
        .trim()
        .split('\n')
        .map((line: string) => JSON.parse(line));
      expect(records).toEqual([
        ['a', 'session-A', fixture.repoRoot],
        ['a', 'session-B', projectFolder],
        ['a', 'session-A', fixture.repoRoot],
        ['a', null, fixture.repoRoot]
      ]);
    } finally {
      if (daemonSession === undefined) delete process.env.COPILOT_AGENT_SESSION_ID;
      else process.env.COPILOT_AGENT_SESSION_ID = daemonSession;
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('preserves resolver decoration and isolated invocation routing across native generation reloads', async () => {
    const events: string[] = [];
    const fixture: IFixture = await createFixtureAsync(false, 'direct', {
      resolver: new DecoratedTestResolver(new ProductionDaemonRequestResolver(), events)
    });
    try {
      expect((await runAsync(fixture, 'initial-decorated', ['build', '--only', 'a'])).terminal).toMatchObject(
        {
          kind: 'requestResult',
          payload: { exitCode: 0 }
        }
      );
      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      const filename: string = path.join(fixture.repoRoot, 'projects/a/package.json');
      const json: { scripts: Record<string, string> } = JSON.parse(fs.readFileSync(filename, 'utf8'));
      json.scripts['_phase:compile'] = 'node build.cjs --decorated-reload';
      fs.writeFileSync(filename, JSON.stringify(json));
      expect(
        (await runAsync(fixture, 'reloaded-decorated', ['build', '--only', 'a'])).terminal
      ).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect(fixture.session.operationGraph).not.toBe(graph);
      const isolated: { invocationKind: 'rushx'; commandOrigin: 'built-in' } = {
        invocationKind: 'rushx',
        commandOrigin: 'built-in'
      };
      expect(
        (await runAsync(fixture, 'isolated-decorated', ['daemon', 'graph', 'show'], isolated)).terminal
      ).toMatchObject({
        kind: 'requestRejected',
        payload: { message: 'Explicit isolated invocation reached the decorated resolver.' }
      });
      expect(events).toEqual([
        'created:0',
        'created:1',
        'disposed:0',
        'created:2',
        'disposed:1',
        'isolated:2'
      ]);
      expect(runs(fixture)).toEqual(['a:one:', 'a:one:--decorated-reload']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
    expect(events.at(-1)).toBe('disposed:2');
  });

  it('rejects an unknown project with only the error line and keeps the graph it loaded for later requests', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      const rejection: { kind: string; payload: { code: string; message: string } } = {
        kind: 'requestRejected',
        payload: {
          code: 'invalidRequest',
          message: 'The project name "nope" passed to "--to" does not exist in rush.json.'
        }
      };
      expect((await runAsync(fixture, 'cold', ['build', '--to', 'nope'])).terminal).toMatchObject(rejection);
      const session: WorkspaceSession = fixture.session;
      const graph: IOperationGraph | undefined = session.operationGraph;
      expect(graph).toBeDefined();
      expect((await runAsync(fixture, 'again', ['build', '--to', 'nope'])).terminal).toMatchObject(rejection);
      expect((await runAsync(fixture, 'valid', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect(fixture.session).toBe(session);
      expect(fixture.session.operationGraph).toBe(graph);
      expect(runs(fixture)).toEqual(['a:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('gives the error as the reason for an invalid selection, before a warning that the parse wrote', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'direct', {
      compatiblePlugins: ['no-such-plugin']
    });
    // The binding request also writes the warning to the daemon's own stderr, which is the launcher log.
    const stderr: jest.SpyInstance = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const rejection: { kind: string; payload: { code: string; message: string } } = {
        kind: 'requestRejected',
        payload: {
          code: 'invalidRequest',
          message:
            'The project name "nope" passed to "--to" does not exist in rush.json.\n' +
            `The daemon's compatible plugin list (rush.json "daemon.compatiblePlugins" or ` +
            'RUSH_DAEMON_COMPATIBLE_PLUGINS) names plugins that are not configured in rush-plugins.json: ' +
            `"no-such-plugin". Check that each entry is the plugin's "pluginName".`
        }
      };
      expect((await runAsync(fixture, 'cold', ['build', '--to', 'nope'])).terminal).toMatchObject(rejection);
      expect((await runAsync(fixture, 'warm', ['build', '--to', 'nope'])).terminal).toMatchObject(rejection);
      expect(runs(fixture)).toEqual([]);
    } finally {
      stderr.mockRestore();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('keeps tier0 session and graph identity for unchanged content, including metadata touches', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      const session: WorkspaceSession = fixture.session;
      const graph: IOperationGraph | undefined = session.operationGraph;
      const filename: string = path.join(fixture.repoRoot, 'projects/a/config/rush-project.json');
      fs.writeFileSync(filename, fs.readFileSync(filename));
      expect((await runAsync(fixture, 'unchanged', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      expect(fixture.session).toBe(session);
      expect(fixture.session.operationGraph).toBe(graph);
      expect(runs(fixture)).toEqual(['a:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('parses the command line of a warm request once, for its identity check and its resolution', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const parse: jest.SpyInstance = jest.spyOn(PhasedCommandEngine, 'parseAsync');
    try {
      await runAsync(fixture, 'cold-parse', ['build', '--only', 'a']);
      parse.mockClear();
      expect((await runAsync(fixture, 'warm-parse', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      expect(parse).toHaveBeenCalledTimes(1);
    } finally {
      parse.mockRestore();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('serves client output and request-scoped settings in the same generation instead of restarting', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial-settings', ['build', '--only', 'a']);
      const session: WorkspaceSession = fixture.session;
      const graph: IOperationGraph | undefined = session.operationGraph;
      const environment: Record<string, string> = {
        ...requestEnvironment(),
        RUSH_PARALLELISM: process.env.RUSH_PARALLELISM === '1' ? '2' : '1',
        RUSHD_OUTPUT: process.env.RUSHD_OUTPUT === 'legacy' ? 'agent' : 'legacy',
        COPILOT_AGENT_SESSION_ID: 'another-agent-session'
      };
      expect(
        (await runAsync(fixture, 'request-scoped-settings', ['build', '--only', 'a'], { environment }))
          .terminal
      ).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0, scheduled: false } });
      expect(fixture.session).toBe(session);
      expect(fixture.session.operationGraph).toBe(graph);
      expect(readDaemonLockfile(fixture.host.paths.lockfilePath)?.pid).toBe(process.pid);
      expect(runs(fixture)).toEqual(['a:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('keeps the selected native SDK handoff instead of restarting for a foreign client engine path', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial-sdk', ['build', '--only', 'a']);
      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      const environment: Record<string, string> = {
        ...requestEnvironment(),
        _RUSH_LIB_PATH: path.join(fixture.repoRoot, 'foreign-client-engine.js')
      };
      expect(
        (await runAsync(fixture, 'foreign-sdk', ['build', '--only', 'a'], { environment })).terminal
      ).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0, scheduled: false } });
      expect(fixture.session.operationGraph).toBe(graph);
      expect(environment._RUSH_LIB_PATH).toBe(path.join(fixture.repoRoot, 'foreign-client-engine.js'));
      expect(runs(fixture)).toEqual(['a:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('keeps its own linked spelling of the native SDK handoff', async () => {
    // A deployed daemon spells rush-lib through its own node_modules link, so plugins can resolve it by name.
    const originalRushLibPath: string | undefined = process.env._RUSH_LIB_PATH;
    const linkRoot: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-sdk-link-'));
    const rushLibFolder: string = path.dirname(require.resolve('@microsoft/rush-lib/package.json'));
    const rushLibLink: string = path.join(linkRoot, 'node_modules', '@microsoft', 'rush-lib');
    fs.mkdirSync(path.dirname(rushLibLink), { recursive: true });
    fs.symlinkSync(rushLibFolder, rushLibLink, 'junction');
    const linkedEntryPoint: string = path.join(
      rushLibLink,
      path.relative(rushLibFolder, require.resolve('@microsoft/rush-lib'))
    );
    process.env._RUSH_LIB_PATH = linkedEntryPoint;
    try {
      const fixture: IFixture = await createFixtureAsync();
      try {
        expect((await runAsync(fixture, 'linked-sdk', ['build', '--only', 'a'])).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0 }
        });
        const environment: Record<string, string> = {
          ...requestEnvironment(),
          _RUSH_LIB_PATH: path.join(fixture.repoRoot, 'foreign-client-engine.js')
        };
        expect(
          (await runAsync(fixture, 'foreign-linked-sdk', ['build', '--only', 'a'], { environment })).terminal
        ).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0, scheduled: false } });
        expect(process.env._RUSH_LIB_PATH).toBe(linkedEntryPoint);
        expect(runs(fixture)).toEqual(['a:one:']);
      } finally {
        await fixture[Symbol.asyncDispose]();
      }
    } finally {
      if (originalRushLibPath === undefined) {
        delete process.env._RUSH_LIB_PATH;
      } else {
        process.env._RUSH_LIB_PATH = originalRushLibPath;
      }
      fs.rmSync(linkRoot, { recursive: true, force: true });
    }
  });

  it('replaces configuration and command shape in-process without using a disposed generation', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      const first: WorkspaceSession = fixture.session;
      const firstGraph: IOperationGraph = first.operationGraph!;
      const firstGeneration: number = fixture.host.workspaceGeneration;
      const packageFile: string = path.join(fixture.repoRoot, 'projects/a/package.json');
      const packageJson: { scripts: Record<string, string> } = JSON.parse(
        fs.readFileSync(packageFile, 'utf8')
      );
      packageJson.scripts['_phase:compile'] = 'node build.cjs --new-definition';
      fs.writeFileSync(packageFile, JSON.stringify(packageJson));
      expect((await runAsync(fixture, 'configuration', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect(fixture.session).not.toBe(first);
      expect(fixture.session.operationGraph).not.toBe(firstGraph);
      expect(firstGraph.abortController.signal.aborted).toBe(true);
      await expect(first.acquireExecutionLeaseAsync()).rejects.toThrow('disposed');
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(firstGeneration);
      expect(readDaemonLockfile(fixture.host.paths.lockfilePath)?.pid).toBe(process.pid);
      const second: WorkspaceSession = fixture.session;
      // A rebuild would share the engine of build, so change a parameter of the compile phase instead.
      const shape: ITerminalExchange = await runAsync(fixture, 'shape', ['build', '-o', 'a', '--production']);
      expect(shape.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(fixture.session).not.toBe(second);
      const production: string = 'a:one:--new-definition --production';
      expect(runs(fixture)).toEqual(['a:one:', 'a:one:--new-definition', production]);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('never executes an old resolved graph after a racing configuration reload', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const entered: IDeferred<void> = createDeferred();
    const release: IDeferred<void> = createDeferred();
    let second: DaemonRequestWireClient | undefined;
    let oldRequest: Promise<ITerminalExchange> | undefined;
    let newRequest: Promise<ITerminalExchange> | undefined;
    let delayed: boolean = false;
    try {
      await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      const oldSession: WorkspaceSession = fixture.session;
      const resolveAsync: ProductionDaemonRequestResolver['resolveRequestAsync'] =
        ProductionDaemonRequestResolver.prototype.resolveRequestAsync;
      jest
        .spyOn(ProductionDaemonRequestResolver.prototype, 'resolveRequestAsync')
        .mockImplementation(async function (
          this: ProductionDaemonRequestResolver,
          options: IResolveDaemonRequestOptions
        ) {
          const resolved: ResolvedDaemonRequest = await resolveAsync.call(this, options);
          if (options.envelope.requestId === 'old' && !delayed) {
            delayed = true;
            entered.resolve();
            await release.promise;
          }
          return resolved;
        });
      oldRequest = runAsync(fixture, 'old', ['build', '--only', 'a']);
      await entered.promise;
      const packageFile: string = path.join(fixture.repoRoot, 'projects/a/package.json');
      const packageJson: { scripts: Record<string, string> } = JSON.parse(
        fs.readFileSync(packageFile, 'utf8')
      );
      packageJson.scripts['_phase:compile'] = 'node build.cjs --raced-definition';
      fs.writeFileSync(packageFile, JSON.stringify(packageJson));
      second = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
      await second.handshakeAsync();
      await second.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('new', 'build', fixture.repoRoot, {
          commandOrigin: 'built-in',
          argv: ['build', '--only', 'a'],
          environment: requestEnvironment()
        })
      });
      expect((await second.readControlAsync()).kind).toBe('queuePosition');
      newRequest = second.readTerminalAsync('new');
      expect(oldSession.operationGraph!.abortController.signal.aborted).toBe(false);
      release.resolve();
      for (const result of await Promise.all([oldRequest, newRequest])) {
        expect(result.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      }
      expect(oldSession.operationGraph!.abortController.signal.aborted).toBe(true);
      expect(runs(fixture)).toEqual(['a:one:', 'a:one:--raced-definition']);
    } finally {
      release.resolve();
      await oldRequest;
      await newRequest;
      jest.restoreAllMocks();
      await second?.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('drains typed pre-execution results for accepted queued clients before hard restart closes them', async () => {
    const selecting: IDeferred<void> = createDeferred();
    const release: IDeferred<void> = createDeferred();
    const fixture: IFixture = await createFixtureAsync(false, 'direct', {
      getSuccessorLaunchAsync: async (context) => {
        selecting.resolve();
        await release.promise;
        return await getInstalledWorkspaceSuccessorLaunchAsync(context);
      }
    });
    let second: DaemonRequestWireClient | undefined;
    let firstResult: Promise<ITerminalExchange> | undefined;
    let secondResult: Promise<ITerminalExchange> | undefined;
    try {
      await runAsync(fixture, 'initialize-before-restart', ['build', '--only', 'a']);
      const environment: Record<string, string> = { ...requestEnvironment(), RUSHD_TEST_INPUT: 'changed' };
      second = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
      await second.handshakeAsync();
      firstResult = runAsync(fixture, 'restart-initiator', ['build', '--only', 'a'], { environment });
      await selecting.promise;
      await second.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('queued-for-restart', 'build', fixture.repoRoot, {
          argv: ['build', '--only', 'a'],
          commandOrigin: 'built-in',
          environment
        })
      });
      expect((await second.readControlAsync()).kind).toBe('queuePosition');
      secondResult = second.readTerminalAsync('queued-for-restart');
      release.resolve();
      for (const result of await Promise.all([firstResult, secondResult])) {
        expect(result.terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 1, retryAfterRestart: true }
        });
        expect(result.frames.every((frame) => frame.kind === DaemonFrameType.controlJson)).toBe(true);
      }
      expect((await fixture.host.restartCompleted)?.pid).not.toBe(process.pid);
      expect(runs(fixture)).toEqual(['a:one:']);
    } finally {
      release.resolve();
      await firstResult;
      await secondResult;
      await second?.closeAsync();
      await fixture.host.restartCompleted;
      await stopSuccessorAsync(fixture.host.paths);
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('restarts a hard environment change in a new process without replaying the triggering request', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'direct', {
      getSuccessorLaunchAsync: getInstalledWorkspaceSuccessorLaunchAsync
    });
    let successor: DaemonRequestWireClient | undefined;
    try {
      await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      const oldGraph: IOperationGraph = fixture.session.operationGraph!;
      const environment: Record<string, string> = {
        ...requestEnvironment(),
        RUSHSTACK_DAEMON_TEST_HARD_INPUT: 'changed'
      };
      expect(
        (await runAsync(fixture, 'hard', ['build', '--only', 'a'], { environment })).terminal
      ).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 1,
          errorMessage: expect.stringContaining('No operation was scheduled or executed')
        }
      });
      const restarted: IWorkspaceProcessRestartResult | undefined = await fixture.host.restartCompleted;
      expect(restarted?.pid).not.toBe(process.pid);
      expect(restarted?.pid).toBe(readDaemonLockfile(fixture.host.paths.lockfilePath)?.pid);
      expect(oldGraph.abortController.signal.aborted).toBe(true);
      expect(runs(fixture)).toEqual(['a:one:']);
      successor = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
      await successor.handshakeAsync();
      expect(
        (
          await runAsync({ ...fixture, client: successor }, 'explicit-next', ['build', '--only', 'a'], {
            environment
          })
        ).terminal
      ).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
    } finally {
      await successor?.closeAsync();
      await stopSuccessorAsync(fixture.host.paths);
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('refuses an unavailable selected Rush version without executing the current engine as that version', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'direct', {
      getSuccessorLaunchAsync: getInstalledWorkspaceSuccessorLaunchAsync
    });
    try {
      await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      const filename: string = path.join(fixture.repoRoot, 'rush.json');
      const json: { rushVersion: string } = JSON.parse(fs.readFileSync(filename, 'utf8'));
      json.rushVersion = '5.999.0';
      fs.writeFileSync(filename, JSON.stringify(json));
      expect(
        (await runAsync(fixture, 'unsupported-version', ['build', '--only', 'a'])).terminal
      ).toMatchObject({
        kind: 'requestRejected',
        payload: { message: expect.stringContaining('Cannot launch selected Rush 5.999.0') }
      });
      expect(runs(fixture)).toEqual(['a:one:']);
      expect(readDaemonLockfile(fixture.host.paths.lockfilePath)?.pid).toBe(process.pid);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  for (const commandName of ['install', 'update']) {
    it(`drains the real ${commandName} worker result before cleanup and successor startup, including partial failure`, async () => {
      const resultReceived: IDeferred<void> = createDeferred();
      const disposalEntered: IDeferred<void> = createDeferred();
      const allowDisposal: IDeferred<void> = createDeferred();
      const fixture: IFixture = await createFixtureAsync(false, 'direct', {
        getSuccessorLaunchAsync: getInstalledWorkspaceSuccessorLaunchAsync,
        onSessionCreated: (session) => {
          const dispose: () => Promise<void> = session[Symbol.asyncDispose].bind(session);
          jest.spyOn(session, Symbol.asyncDispose).mockImplementation(async () => {
            if (session.operationGraph) {
              disposalEntered.resolve();
              await resultReceived.promise;
              await allowDisposal.promise;
            }
            await dispose();
          });
        }
      });
      let successor: DaemonRequestWireClient | undefined;
      try {
        await runAsync(fixture, 'initial', ['build', '--only', 'a']);
        await StandardScriptUpdater.updateAsync(
          InternalRushConfiguration.loadFromConfigurationFile(path.join(fixture.repoRoot, 'rush.json'))
        );
        const oldGraph: IOperationGraph = fixture.session.operationGraph!;
        const scriptPath: string = path.join(fixture.repoRoot, 'common/temp/mutate.cjs');
        fs.writeFileSync(
          scriptPath,
          `
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'projects/a/package.json');
const json = JSON.parse(fs.readFileSync(file, 'utf8'));
json.scripts['_phase:compile'] = 'node build.cjs --post-mutation';
fs.writeFileSync(file, JSON.stringify(json));
fs.appendFileSync(path.join(root, 'common/temp/mutation-count.txt'), 'once\\n');
console.log('native-mutation-applied');
process.exit(23);
`
        );
        const rushJsonPath: string = path.join(fixture.repoRoot, 'rush.json');
        const json: { eventHooks?: object } = JSON.parse(fs.readFileSync(rushJsonPath, 'utf8'));
        json.eventHooks = { preRushInstall: ['node common/temp/mutate.cjs'] };
        fs.writeFileSync(rushJsonPath, JSON.stringify(json));
        const result: ITerminalExchange = await runAsync(fixture, 'mutation', [
          commandName,
          '--bypass-policy',
          '--max-install-attempts',
          '0'
        ]);
        expect(result.terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 1, outcome: 'failure', aborted: false }
        });
        resultReceived.resolve();
        await disposalEntered.promise;
        expect(oldGraph.abortController.signal.aborted).toBe(false);
        expect(readDaemonLockfile(fixture.host.paths.lockfilePath)?.pid).toBe(process.pid);
        allowDisposal.resolve();
        const restarted: IWorkspaceProcessRestartResult | undefined = await fixture.host.restartCompleted;
        expect(restarted?.pid).not.toBe(process.pid);
        expect(oldGraph.abortController.signal.aborted).toBe(true);
        successor = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
        await successor.handshakeAsync();
        expect(
          (await runAsync({ ...fixture, client: successor }, 'post-mutation', ['build', '--only', 'a']))
            .terminal
        ).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0 }
        });
        expect(runs(fixture)).toEqual(['a:one:', 'a:one:--post-mutation']);
        expect(fs.readFileSync(path.join(fixture.repoRoot, 'common/temp/mutation-count.txt'), 'utf8')).toBe(
          'once\n'
        );
      } finally {
        resultReceived.resolve();
        allowDisposal.resolve();
        await successor?.closeAsync();
        await stopSuccessorAsync(fixture.host.paths);
        await fixture[Symbol.asyncDispose]();
        jest.restoreAllMocks();
      }
    });
  }

  it('releases the lock before reporting an idle result so a real native Rush action can run', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      expect((await runAsync(fixture, 'warm', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });

      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      const native: INativeCommandResult = await runNativeCommandAsync(fixture.repoRoot, [
        'rebuild',
        '--only',
        'a',
        '--parallelism',
        '3',
        '--verbose'
      ]);
      expect(native).toMatchObject({ exitCode: 0 });
      expect(native.stdout).toContain('built-a-one');
      expect(runs(fixture)).toEqual(['a:one:', 'a:one:']);
      expect((await runAsync(fixture, 'after-native', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect(fixture.session.operationGraph).toBe(graph);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('uses one native lease for a merged batch and excludes native actions throughout reconciliation and execution', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const leaseRequested: IDeferred<void> = createDeferred();
    const grantLease: IDeferred<void> = createDeferred();
    const reconcileEntered: IDeferred<void> = createDeferred();
    const releaseReconciliation: IDeferred<void> = createDeferred();
    const secondAdmitted: IDeferred<void> = createDeferred();
    let secondClient: DaemonRequestWireClient | undefined;
    let gate: INativeScriptGate | undefined;
    let first: Promise<ITerminalExchange> | undefined;
    let second: Promise<ITerminalExchange> | undefined;
    try {
      await runAsync(fixture, 'initialize', ['build', '--only', 'c']);
      // Count the batch's lease independently of optional idle-maintenance leases.
      await fixture.session.quiesceWarmSetAsync();
      const graph: IOperationGraph = fixture.session.operationGraph!;
      const scheduleSpy: jest.SpyInstance = jest.spyOn(graph, 'scheduleIterationAsync');
      const acquireExecutionLeaseAsync: WorkspaceSession['acquireExecutionLeaseAsync'] =
        fixture.session.acquireExecutionLeaseAsync.bind(fixture.session);
      const leaseSpy: jest.SpyInstance = jest
        .spyOn(fixture.session, 'acquireExecutionLeaseAsync')
        .mockImplementationOnce(async () => {
          leaseRequested.resolve();
          await grantLease.promise;
          return await acquireExecutionLeaseAsync();
        });
      const reconcileAsync: WorkspaceSession['reconcileInvalidationsAsync'] =
        fixture.session.reconcileInvalidationsAsync.bind(fixture.session);
      jest.spyOn(fixture.session, 'reconcileInvalidationsAsync').mockImplementationOnce(async () => {
        reconcileEntered.resolve();
        await releaseReconciliation.promise;
        return await reconcileAsync();
      });
      const routeAsync: PhasedRequestRouter['executeAsync'] = PhasedRequestRouter.prototype.executeAsync;
      let routedRequests: number = 0;
      jest.spyOn(PhasedRequestRouter.prototype, 'executeAsync').mockImplementation(async function (
        this: PhasedRequestRouter,
        ...args: Parameters<PhasedRequestRouter['executeAsync']>
      ) {
        routedRequests++;
        return await routeAsync.apply(this, args);
      });
      const admitAsync: RequestAdmissionController['acquireAsync'] =
        RequestAdmissionController.prototype.acquireAsync;
      jest.spyOn(RequestAdmissionController.prototype, 'acquireAsync').mockImplementation(async function (
        this: RequestAdmissionController,
        ...args: Parameters<RequestAdmissionController['acquireAsync']>
      ) {
        const lease: IRequestLease = await admitAsync.apply(this, args);
        // The router admits each request once, after the workspace lifecycle has, and then enqueues it.
        if (routedRequests === 2) secondAdmitted.resolve();
        return lease;
      });
      gate = await createNativeScriptGateAsync(fixture.repoRoot, 'a');
      secondClient = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
      await secondClient.handshakeAsync();
      first = runAsync(fixture, 'dependency', ['build', '--to', 'a']);
      await leaseRequested.promise;
      // Accepted while the batch waits for its native lease, so it joins before the batch reconciles.
      second = runAsync({ ...fixture, client: secondClient }, 'consumer', ['build', '--to', 'b']);
      await secondAdmitted.promise;
      // After admission, the router enqueues the request without awaiting.
      await new Promise<void>((resolve) => setImmediate(resolve));
      grantLease.resolve();
      await reconcileEntered.promise;
      expect(await runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'c'])).toMatchObject({
        exitCode: 1,
        stdout: expect.stringContaining('Another Rush command')
      });
      releaseReconciliation.resolve();
      await Promise.race([
        gate.entered,
        first.then((result) => {
          throw new Error(
            `Daemon iteration did not enter its script gate: ${JSON.stringify(result.terminal)}`
          );
        })
      ]);
      expect(await runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'c'])).toMatchObject({
        exitCode: 1,
        stdout: expect.stringContaining('Another Rush command')
      });
      await gate.releaseAsync();
      const results: ITerminalExchange[] = await Promise.all([first, second]);
      for (const result of results)
        expect(result.terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0 }
        });
      expect(leaseSpy).toHaveBeenCalledTimes(1);
      expect(scheduleSpy).toHaveBeenCalledTimes(1);
      expect(runs(fixture)).toEqual(['c:one:', 'a:one:', 'b:one:']);
    } finally {
      grantLease.resolve();
      releaseReconciliation.resolve();
      await gate?.releaseAsync();
      await first;
      await second;
      jest.restoreAllMocks();
      await secondClient?.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('holds the native lease until operation output has drained, before publishing the terminal result', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const outputStarted: IDeferred<void> = createDeferred();
    const releaseOutput: IDeferred<void> = createDeferred();
    const iterationFinished: IDeferred<void> = createDeferred();
    let request: Promise<IDaemonPhasedRequestResult> | undefined;
    try {
      await runAsync(fixture, 'initialize', ['build', '--only', 'c']);
      fixture.session.operationGraph!.hooks.afterExecuteIterationAsync.tap(
        { name: 'test iteration completed', stage: Infinity },
        (status) => {
          iterationFinished.resolve();
          return status;
        }
      );
      const client: TestPhasedRequestClient = new TestPhasedRequestClient();
      client.onWriteAsync = async (write) => {
        if (write.operationId && write.text) {
          outputStarted.resolve();
          await releaseOutput.promise;
        }
      };
      request = new PhasedRequestRouter(fixture.session).executeAsync(
        {
          commandName: 'build',
          commandOrigin: 'built-in',
          requestId: 'output-drain',
          environment: {},
          engineShape: fixture.session.engineShape!,
          operationSelection: [{ operationId: 'a (compile)', enabledState: true }]
        },
        client,
        true
      );
      await outputStarted.promise;
      await iterationFinished.promise;
      expect(await runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'c'])).toMatchObject({
        exitCode: 1
      });
      releaseOutput.resolve();
      expect(await request).toMatchObject({ exitCode: 0 });
      expect(await runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'c'])).toMatchObject({
        exitCode: 0
      });
    } finally {
      releaseOutput.resolve();
      await request;
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('awaits an outstanding execution lease before disposing the engine', async () => {
    const fixture: IFixture = await createFixtureAsync();
    let lease: AsyncDisposable | undefined;
    let disposal: Promise<void> | undefined;
    try {
      await runAsync(fixture, 'initialize', ['build', '--only', 'a']);
      lease = await fixture.session.acquireExecutionLeaseAsync();
      let disposed: boolean = false;
      disposal = fixture.session[Symbol.asyncDispose]().then(() => {
        disposed = true;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(disposed).toBe(false);
      await expect(fixture.session.acquireExecutionLeaseAsync()).rejects.toThrow('disposed');
      await lease![Symbol.asyncDispose]();
      await disposal;
      expect(disposed).toBe(true);
      expect(fixture.session.operationGraph!.abortController.signal.aborted).toBe(true);
    } finally {
      await lease?.[Symbol.asyncDispose]();
      await disposal;
      await fixture[Symbol.asyncDispose]();
    }
  });

  for (const kind of ['rig', 'inherited'] as const) {
    it(`uses real ${kind} configuration and native cache, and reloads unwatched configuration changes`, async () => {
      const fixture: IFixture = await createFixtureAsync(true, kind);
      try {
        const initial: ITerminalExchange = await runAsync(fixture, 'initial', ['build', '--only', 'a']);
        expect(initial.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
        expect(logText(initial)).toContain('Successfully set cache entry');
        expect((await runAsync(fixture, 'warm', ['build', '--only', 'a'])).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0, scheduled: false }
        });
        fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'two');
        await runAsync(fixture, 'changed', ['build', '--only', 'a']);
        fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'one');
        expect((await runAsync(fixture, 'cached', ['build', '--only', 'a'])).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0, operationResults: [{ status: 'FROM CACHE' }] }
        });
        expect(runs(fixture)).toEqual(['a:one:', 'a:two:']);
        const configurationFile: string =
          kind === 'rig'
            ? path.join(
                fixture.repoRoot,
                'projects/a/node_modules/fixture-rig/profiles/default/config/rush-project.json'
              )
            : path.join(fixture.repoRoot, 'common/temp/inherited-rush-project.json');
        fs.writeFileSync(
          configurationFile,
          JSON.stringify({
            operationSettings: [
              {
                operationName: '_phase:compile',
                outputFolderNames: ['lib'],
                disableBuildCacheForOperation: true
              }
            ]
          })
        );
        const oldGraph: IOperationGraph | undefined = fixture.session.operationGraph;
        expect(
          (await runAsync(fixture, 'configuration-changed', ['build', '--only', 'a'])).terminal
        ).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0 }
        });
        expect(fixture.session.operationGraph).not.toBe(oldGraph);
        expect(runs(fixture)).toHaveLength(3);
      } finally {
        await fixture[Symbol.asyncDispose]();
      }
    });
  }

  it('constructs the engine from fresh rig data without clearing or modifying native configuration caches', async () => {
    const fixture: IFixture = await createFixtureAsync(true, 'rig');
    try {
      const project: RushConfigurationProject = fixture.session.rushConfiguration.projectsByName.get('a')!;
      const terminal: Terminal = new Terminal(new NoOpTerminalProvider());
      const cached: RushProjectConfiguration | undefined =
        await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal);
      fs.writeFileSync(
        path.join(
          fixture.repoRoot,
          'projects/a/node_modules/fixture-rig/profiles/default/config/rush-project.json'
        ),
        JSON.stringify({
          operationSettings: [
            {
              operationName: '_phase:compile',
              outputFolderNames: ['lib'],
              disableBuildCacheForOperation: true
            }
          ]
        })
      );
      expect((await runAsync(fixture, 'fresh-engine', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      const operation: Operation | undefined = Array.from(fixture.session.operationGraph!.operations).find(
        (candidate) => candidate.associatedProject.packageName === project.packageName
      );
      expect(operation!.settings!.disableBuildCacheForOperation).toBe(true);
      expect(await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal)).toBe(cached);
      expect(
        cached!.operationSettingsByOperationName.get('_phase:compile')!.disableBuildCacheForOperation
      ).toBeUndefined();
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('uses fresh inherited ignore globs for native git selectors without changing shared caches', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'rig');
    try {
      const project: RushConfigurationProject = fixture.session.rushConfiguration.projectsByName.get('a')!;
      const configurationFile: string = path.join(
        fixture.repoRoot,
        'projects/a/node_modules/fixture-rig/profiles/default/config/rush-project.json'
      );
      const settings: object = {
        operationSettings: [{ operationName: '_phase:compile', outputFolderNames: ['lib'] }]
      };
      fs.writeFileSync(
        configurationFile,
        JSON.stringify({ ...settings, incrementalBuildIgnoredGlobs: ['input.txt'] })
      );
      const terminal: Terminal = new Terminal(new NoOpTerminalProvider());
      const cached: RushProjectConfiguration | undefined =
        await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal);
      fs.writeFileSync(configurationFile, JSON.stringify(settings));
      fs.writeFileSync(path.join(project.projectFolder, 'input.txt'), 'git-selection');
      execFileSync('git', ['add', 'projects/a/input.txt'], { cwd: fixture.repoRoot });
      const selected: ITerminalExchange = await runAsync(fixture, 'git-selection', [
        'build',
        '--only',
        'git:HEAD'
      ]);
      expect(selected.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, operationResults: [{ operationId: 'a (compile)' }] }
      });
      expect(runs(fixture)).toEqual(['a:git-selection:']);
      expect(await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal)).toBe(cached);
      expect(Array.from(cached!.incrementalBuildIgnoredGlobs)).toEqual(['input.txt']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('executes real selected scripts, reuses one all-project graph, refreshes inputs and closes it', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const originalEnvironment: NodeJS.ProcessEnv = { ...process.env };
    const originalCwd: string = process.cwd();
    let graph: IOperationGraph | undefined;
    try {
      const first: ITerminalExchange = await runAsync(fixture, 'initial', [
        'build',
        '--to',
        'b',
        '--parallelism',
        '3'
      ]);
      expect(first.terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 0,
          scheduled: true,
          operationResults: [
            { operationId: 'a (compile)', status: 'SUCCESS' },
            { operationId: 'b (compile)', status: 'SUCCESS' }
          ]
        }
      });
      expect(logText(first)).toContain('built-a-one');
      expect(runs(fixture)).toEqual(['a:one:', 'b:one:']);
      graph = fixture.session.operationGraph;
      expect(graph?.operations.size).toBe(3);

      const warm: ITerminalExchange = await runAsync(fixture, 'warm', [
        'build',
        '--to',
        'b',
        '--parallelism',
        '3'
      ]);
      expect(warm.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      expect(fixture.session.operationGraph).toBe(graph);
      expect(runs(fixture)).toHaveLength(2);

      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'two');
      const changed: ITerminalExchange = await runAsync(fixture, 'changed', [
        'build',
        '--to',
        'b',
        '--parallelism',
        '3'
      ]);
      expect(changed.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(runs(fixture)).toEqual(['a:one:', 'b:one:', 'a:two:', 'b:one:']);

      const selected: ITerminalExchange = await runAsync(
        fixture,
        'cwd-selection',
        ['build', '--only', '.', '--parallelism', '3'],
        {
          cwd: path.join(fixture.repoRoot, 'projects/c')
        }
      );
      expect(selected.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, operationResults: [{ operationId: 'c (compile)' }] }
      });
      expect(runs(fixture).at(-1)).toBe('c:one:');
      expect(fixture.session.operationGraph).toBe(graph);
      expect(process.cwd()).toBe(originalCwd);
      // Only the names, so that a failure doesn't print the values of the whole process environment.
      const changedNames: string[] = [
        ...new Set([...Object.keys(originalEnvironment), ...Object.keys(process.env)])
      ].filter((name: string) => process.env[name] !== originalEnvironment[name]);
      expect(changedNames).toEqual([]);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
    expect(graph?.abortController.signal.aborted).toBe(true);
    await expect(fixture.session.reconcileInvalidationsAsync()).rejects.toThrow('disposed');
  });

  it('does not expand unsafe --only selection and reloads changed parameters while rejecting ambiguous rushx', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      const first: ITerminalExchange = await runAsync(fixture, 'only', [
        'build',
        '--only',
        'b',
        '--production'
      ]);
      expect(first.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, operationResults: [{ operationId: 'b (compile)' }] }
      });
      expect(runs(fixture)).toEqual(['b:one:--production']);
      const originalGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      expect((await runAsync(fixture, 'parameters', ['build', '--only', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect(fixture.session.operationGraph).not.toBe(originalGraph);
      expect(
        (
          await runAsync(fixture, 'environment', ['build', '--only', 'b', '--production'], {
            environment: {}
          })
        ).terminal
      ).toMatchObject({ kind: 'requestRejected' });
      expect(
        (await runAsync(fixture, 'rushx', ['build'], { commandOrigin: 'custom' })).terminal
      ).toMatchObject({ kind: 'requestRejected' });
      expect(runs(fixture)).toEqual(['b:one:--production', 'b:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('preserves warnings-as-errors and failed script results', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'warning');
      const warning: ITerminalExchange = await runAsync(fixture, 'warning', ['build', '--only', 'a']);
      expect(warning.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, outcome: 'success-with-warning' }
      });
      expect(logText(warning)).toContain('warning-a');
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'failure');
      const failed: ITerminalExchange = await runAsync(fixture, 'failed', ['build', '--only', 'a']);
      expect(failed.terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 1,
          outcome: 'failure',
          operationResults: [{ operationId: 'a (compile)', status: 'FAILURE' }]
        }
      });
      expect(await runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'c'])).toMatchObject({
        exitCode: 0
      });
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('rechecks installation state under the execution lease and releases the lock when reconciliation fails', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initialize', ['build', '--only', 'a']);
      const flagPath: string = path.join(fixture.repoRoot, 'common/temp/last-link.flag');
      fs.rmSync(flagPath);
      expect((await runAsync(fixture, 'unlinked', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { message: expect.stringContaining('Link flag invalid') }
      });
      expect(runs(fixture)).toEqual(['a:one:']);
      fs.writeFileSync(flagPath, '{}');
      expect(await runNativeCommandAsync(fixture.repoRoot, ['rebuild', '--only', 'c'])).toMatchObject({
        exitCode: 0
      });
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('runs rebuild scripts on every request and reloads changed graph definitions', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      for (const id of ['rebuild-one', 'rebuild-two']) {
        expect((await runAsync(fixture, id, ['rebuild', '--only', 'a'])).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0, scheduled: true }
        });
      }
      expect(runs(fixture)).toEqual(['a:one:', 'a:one:']);
      fs.writeFileSync(
        path.join(fixture.repoRoot, 'projects/a/package.json'),
        '{"name":"a","version":"1.0.0","scripts":{"_phase:compile":"echo wrong"}}'
      );
      const oldGraph: IOperationGraph | undefined = fixture.session.operationGraph;
      expect(
        (await runAsync(fixture, 'changed-definition', ['rebuild', '--only', 'a'])).terminal
      ).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(fixture.session.operationGraph).not.toBe(oldGraph);
      expect(runs(fixture)).toHaveLength(2);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('uses the native local build cache instead of executing a previously cached input again', async () => {
    const fixture: IFixture = await createFixtureAsync(true);
    try {
      expect((await runAsync(fixture, 'cache-one', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'two');
      expect((await runAsync(fixture, 'cache-two', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'one');
      const cached: ITerminalExchange = await runAsync(fixture, 'cache-restore', ['build', '--only', 'a']);
      expect(cached.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, operationResults: [{ operationId: 'a (compile)', status: 'FROM CACHE' }] }
      });
      expect(runs(fixture)).toEqual(['a:one:', 'a:two:']);
      expect(fs.readFileSync(path.join(fixture.repoRoot, 'projects/a/lib/output.txt'), 'utf8')).toBe('one');
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('runs the initial script for every warm build request, as native rush build does, if incremental builds are off', async () => {
    const fixture: IFixture = await createFixtureAsync(true, 'direct', {
      incrementalScript: true,
      incrementalBuilds: false
    });
    // With incremental builds on, an edit of this source file runs the incremental script (see the next test).
    const inputPath: string = path.join(fixture.repoRoot, 'projects/a/src/input.txt');
    try {
      fs.mkdirSync(path.dirname(inputPath), { recursive: true });
      for (const [requestId, input] of [
        ['initial-script-1', 'one'],
        ['initial-script-2', 'two'],
        ['initial-script-3', 'three']
      ]) {
        fs.writeFileSync(inputPath, input);
        const exchange: ITerminalExchange = await runAsync(fixture, requestId, ['build', '--only', 'a']);
        expect(exchange.terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0, operationResults: [{ operationId: 'a (compile)', status: 'SUCCESS' }] }
        });
        expect(logText(exchange)).toContain('Invoking (initial): node build.cjs');
        expect(logText(exchange)).not.toContain('Not using the incremental command');
      }
      // A watch-only incremental script can keep outputs of deleted inputs, and its output would be cached
      // under the key of the initial script that native Rush runs.
      expect(runs(fixture)).toEqual(['a:one:', 'a:two:', 'a:three:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('runs the incremental script for an edit of a built file, and never caches its result', async () => {
    const fixture: IFixture = await createFixtureAsync(true, 'direct', { incrementalScript: true });
    const inputPath: string = path.join(fixture.repoRoot, 'projects/a/src/input.txt');
    const buildAsync = async (requestId: string, input: string, status: string): Promise<string> => {
      fs.mkdirSync(path.dirname(inputPath), { recursive: true });
      fs.writeFileSync(inputPath, input);
      const exchange: ITerminalExchange = await runAsync(fixture, requestId, ['build', '--only', 'a']);
      expect(exchange.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, operationResults: [{ operationId: 'a (compile)', status }] }
      });
      return logText(exchange);
    };
    try {
      expect(await buildAsync('incremental-1', 'one', 'SUCCESS')).toContain(
        'Invoking (initial): node build.cjs'
      );
      const incremental: string = await buildAsync('incremental-2', 'two', 'SUCCESS');
      expect(incremental).toContain('Invoking (incremental): node build.cjs --incremental');
      expect(incremental).toContain(
        'This operation ran its incremental command; not writing a build cache entry.'
      );
      await buildAsync('incremental-3', 'three', 'SUCCESS');
      // The result of the incremental script was not cached, so it runs again.
      await buildAsync('incremental-4', 'two', 'SUCCESS');
      // The result of the initial script was cached.
      await buildAsync('incremental-5', 'one', 'FROM CACHE');
      // The incremental script never runs on top of outputs restored from the build cache.
      expect(await buildAsync('incremental-6', 'three', 'SUCCESS')).toContain(
        'Not using the incremental command because its outputs were not built by a successful run of its own' +
          ' command in this process.'
      );
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'root');
      expect(await buildAsync('incremental-7', 'three', 'SUCCESS')).toContain(
        'Not using the incremental command because a configuration file changed ("projects/a/input.txt").'
      );
      expect(runs(fixture)).toEqual([
        'a:one:',
        'a:two:--incremental',
        'a:three:--incremental',
        'a:two:--incremental',
        'a:three:',
        'a:three:'
      ]);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('re-runs only the operation whose declared outputs were deleted after a warm build', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial', ['build']);
      expect(runs(fixture)).toEqual(expect.arrayContaining(['a:one:', 'b:one:', 'c:one:']));
      expect((await runAsync(fixture, 'warm', ['build'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      fs.rmSync(path.join(fixture.repoRoot, 'projects/a/lib'), { recursive: true });
      expect((await runAsync(fixture, 'unrelated', ['build', '--only', 'c'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      expect((await runAsync(fixture, 'deleted', ['build', '--to', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(runs(fixture).slice(3)).toEqual(['a:one:']);
      expect(fs.readFileSync(path.join(fixture.repoRoot, 'projects/a/lib/output.txt'), 'utf8')).toBe('one');
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/c/lib/extra.txt'), 'stray');
      expect((await runAsync(fixture, 'changed', ['build'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(runs(fixture).slice(4)).toEqual(['c:one:']);
      expect((await runAsync(fixture, 'unchanged', ['build'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      expect(runs(fixture)).toHaveLength(5);
      expect(fixture.session.operationGraph).toBe(graph);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('reuses results that legacy skip detection found up to date until their declared outputs are deleted', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial', ['build']);
      expect(runs(fixture)).toHaveLength(3);
      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      // Reload the configuration without changing the inputs of any operation, so the new graph has no results.
      const commandLineFile: string = path.join(fixture.repoRoot, 'common/config/rush/command-line.json');
      const commandLine: { commands: object[] } = JSON.parse(fs.readFileSync(commandLineFile, 'utf8'));
      commandLine.commands.push({
        commandKind: 'global',
        name: 'unrelated',
        summary: 'Unrelated',
        shellCommand: 'node --version'
      });
      fs.writeFileSync(commandLineFile, JSON.stringify(commandLine));
      const reloaded: ITerminalExchange = await runAsync(fixture, 'reloaded', ['build']);
      expect(reloaded.terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 0,
          scheduled: true,
          operationResults: [
            { operationId: 'a (compile)', status: 'SKIPPED' },
            { operationId: 'b (compile)', status: 'SKIPPED' },
            { operationId: 'c (compile)', status: 'SKIPPED' }
          ]
        }
      });
      expect(fixture.session.operationGraph).not.toBe(graph);

      // The skipped results are current, so they are not checked again.
      expect((await runAsync(fixture, 'warm', ['build'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });

      fs.rmSync(path.join(fixture.repoRoot, 'projects/c/lib'), { recursive: true });
      expect((await runAsync(fixture, 'deleted', ['build'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(runs(fixture).slice(3)).toEqual(['c:one:']);
      expect(fs.readFileSync(path.join(fixture.repoRoot, 'projects/c/lib/output.txt'), 'utf8')).toBe('one');
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('restores deleted outputs of a warm operation from the native build cache', async () => {
    const fixture: IFixture = await createFixtureAsync(true);
    try {
      await runAsync(fixture, 'initial', ['build', '--to', 'b']);
      fs.rmSync(path.join(fixture.repoRoot, 'projects/a/lib'), { recursive: true });
      const deleted: ITerminalExchange = await runAsync(fixture, 'deleted', ['build', '--to', 'b']);
      expect(deleted.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      const { operationResults } = (deleted.terminal as { payload: IDaemonPhasedRequestResult }).payload;
      expect(operationResults.filter((result) => result.status !== 'SKIPPED')).toEqual([
        expect.objectContaining({ operationId: 'a (compile)', status: 'FROM CACHE' })
      ]);
      expect(runs(fixture)).toEqual(['a:one:', 'b:one:']);
      expect(fs.readFileSync(path.join(fixture.repoRoot, 'projects/a/lib/output.txt'), 'utf8')).toBe('one');
      expect((await runAsync(fixture, 'restored', ['build', '--to', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('re-runs a selected warm operation whose nested outputs were edited in place or deleted', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial', ['build']);
      expect(runs(fixture)).toEqual(expect.arrayContaining(['a:one:', 'b:one:', 'c:one:']));
      const libPath: string = path.join(fixture.repoRoot, 'projects/a/lib');
      const outputPath: string = path.join(libPath, 'output.txt');
      const { ino, mtimeMs: libModifiedMs } = fs.statSync(outputPath);
      const libFolderModifiedMs: number = fs.statSync(libPath).mtimeMs;
      fs.writeFileSync(outputPath, 'edited in place');
      // Neither the output folder nor the file identity changes, so the per-folder check cannot see this.
      expect(fs.statSync(outputPath).ino).toBe(ino);
      expect(fs.statSync(outputPath).mtimeMs).not.toBe(libModifiedMs);
      expect(fs.statSync(libPath).mtimeMs).toBe(libFolderModifiedMs);
      expect((await runAsync(fixture, 'unrelated', ['build', '--only', 'c'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      expect((await runAsync(fixture, 'edited', ['build', '--to', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(runs(fixture).slice(3)).toEqual(['a:one:']);
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('one');

      fs.mkdirSync(path.join(libPath, 'nested'));
      fs.writeFileSync(path.join(libPath, 'nested/stale.txt'), 'stale');
      expect((await runAsync(fixture, 'added', ['build', '--to', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(runs(fixture).slice(4)).toEqual(['a:one:']);
      const addedFolderModifiedMs: number = fs.statSync(libPath).mtimeMs;
      fs.rmSync(path.join(libPath, 'nested/stale.txt'));
      expect(fs.statSync(libPath).mtimeMs).toBe(addedFolderModifiedMs);
      expect((await runAsync(fixture, 'deleted', ['build', '--to', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(runs(fixture).slice(5)).toEqual(['a:one:']);
      expect((await runAsync(fixture, 'unchanged', ['build'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      expect(runs(fixture)).toHaveLength(6);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('restores an output edited in place from the build cache before a consumer embeds it', async () => {
    const fixture: IFixture = await createFixtureAsync(true);
    try {
      // Like a bundler, b's output embeds a's output.
      fs.writeFileSync(
        path.join(fixture.repoRoot, 'projects/b/build.cjs'),
        `
const fs = require('node:fs');
const input = fs.readFileSync('input.txt', 'utf8');
fs.appendFileSync('../../runs.txt', 'b:' + input + ':\\n');
fs.mkdirSync('lib', { recursive: true });
fs.writeFileSync('lib/output.txt', input + '+' + fs.readFileSync('../a/lib/output.txt', 'utf8'));
`
      );
      await runAsync(fixture, 'initial', ['build', '--to', 'b']);
      const outputPath: string = path.join(fixture.repoRoot, 'projects/b/lib/output.txt');
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('one+one');
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/lib/output.txt'), 'edited in place');
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/b/input.txt'), 'two');
      const edited: ITerminalExchange = await runAsync(fixture, 'edited', ['build', '--to', 'b']);
      expect(edited.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      const { operationResults } = (edited.terminal as { payload: IDaemonPhasedRequestResult }).payload;
      expect(operationResults).toEqual([
        expect.objectContaining({ operationId: 'a (compile)', status: 'FROM CACHE' }),
        expect.objectContaining({ operationId: 'b (compile)', status: 'SUCCESS' })
      ]);
      expect(fs.readFileSync(path.join(fixture.repoRoot, 'projects/a/lib/output.txt'), 'utf8')).toBe('one');
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('two+one');
      // The consumer's new cache entry holds the restored output, not the edited one.
      fs.rmSync(path.join(fixture.repoRoot, 'projects/b/lib'), { recursive: true });
      const restored: ITerminalExchange = await runAsync(fixture, 'restored', ['build', '--to', 'b']);
      expect((restored.terminal as { payload: IDaemonPhasedRequestResult }).payload.operationResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ operationId: 'b (compile)', status: 'FROM CACHE' })
        ])
      );
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('two+one');
      expect(runs(fixture)).toEqual(['a:one:', 'b:one:', 'b:two:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('reconciles changes made without a connected client and preserves an empty native selection', async () => {
    const fixture: IFixture = await createFixtureAsync();
    let reconnected: DaemonRequestWireClient | undefined;
    try {
      expect((await runAsync(fixture, 'initial', ['build', '--to', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      await fixture.client.closeAsync();
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/a/input.txt'), 'offline-change');
      reconnected = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
      await reconnected.handshakeAsync();
      const next: IFixture = { ...fixture, client: reconnected };
      expect((await runAsync(next, 'reconnected', ['build', '--to', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(fixture.session.operationGraph).toBe(graph);
      expect(runs(fixture)).toEqual(['a:one:', 'b:one:', 'a:offline-change:', 'b:one:']);
      expect((await runAsync(next, 'empty', ['build', '--to-except', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false, operationResults: [] }
      });
      expect(runs(fixture)).toHaveLength(4);
    } finally {
      await reconnected?.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('awaits runner cleanup before shutdown completes and does not close twice on abort', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const releaseCleanup: IDeferred<void> = createDeferred();
    const cleanupStarted: IDeferred<void> = createDeferred();
    let shutdown: Promise<void> | undefined;
    try {
      expect((await runAsync(fixture, 'initial', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      const graph: IOperationGraph = fixture.session.operationGraph!;
      const closeRunnersAsync: () => Promise<void> = graph.closeRunnersAsync.bind(graph);
      const closeSpy: jest.SpyInstance<Promise<void>, [operations?: Iterable<Operation>]> = jest
        .spyOn(graph, 'closeRunnersAsync')
        .mockImplementation(async () => {
          cleanupStarted.resolve();
          await releaseCleanup.promise;
          await closeRunnersAsync();
        });
      let closed: boolean = false;
      shutdown = fixture.host.closeAsync().then(() => {
        closed = true;
      });
      await cleanupStarted.promise;
      expect(closed).toBe(false);
      releaseCleanup.resolve();
      await shutdown;
      expect(closed).toBe(true);
      expect(graph.abortController.signal.aborted).toBe(true);
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      releaseCleanup.resolve();
      await shutdown;
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('rejects invalid inherited project configuration before creating a graph or running scripts', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const stderrWrite: jest.SpyInstance = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      fs.writeFileSync(
        path.join(fixture.repoRoot, 'projects/a/config/rush-project.json'),
        '{"extends":"./unowned.json"}'
      );
      expect((await runAsync(fixture, 'unsupported', ['build'])).terminal).toMatchObject({
        kind: 'requestRejected',
        // In-process Rush reports the error natively if the request selects the project.
        payload: {
          code: 'unsupported',
          message: expect.stringMatching(/^The daemon could not load the configuration of project "a": /)
        }
      });
      expect(stderrWrite).toHaveBeenCalledWith(
        expect.stringMatching(/^Warning: Rush could not load the configuration of project "a": /)
      );
      expect(fixture.session.operationGraph).toBeUndefined();
      expect(runs(fixture)).toEqual([]);
    } finally {
      stderrWrite.mockRestore();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('hands requests to in-process Rush while a project that a filtered install skipped has no rig package', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'rig');
    const rigFolder: string = path.join(fixture.repoRoot, 'projects/a/node_modules/fixture-rig');
    const installedRigFolder: string = `${rigFolder}-installed`;
    const stderr: string[] = [];
    const stderrWrite: jest.SpyInstance = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => stderr.push(chunk.toString()) > 0);
    const expectFallbackAsync = async (requestId: string): Promise<void> => {
      stderr.length = 0;
      const rejected: ITerminalExchange = await runAsync(fixture, requestId, ['build', '--only', 'c']);
      expect(rejected.terminal).toMatchObject({
        kind: 'requestRejected',
        payload: {
          code: 'unsupported',
          message:
            `The daemon could not load the configuration of project "a": Cannot find module ` +
            `'fixture-rig/package.json' from '${path.join(fixture.repoRoot, 'projects/a')}' ` +
            '(the daemon loads every project, so it needs a full "rush install")'
        }
      });
      expect(stderr.join('')).toContain(
        `Warning: Rush could not load the configuration of project "a": Cannot find module 'fixture-rig/package.json'`
      );
    };
    try {
      fs.renameSync(rigFolder, installedRigFolder);
      await expectFallbackAsync('unbound');
      expect(fixture.session.operationGraph).toBeUndefined();

      fs.renameSync(installedRigFolder, rigFolder);
      const installed: ITerminalExchange = await runAsync(fixture, 'installed', ['build', '--only', 'c']);
      expect(installed.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });

      // Removing an installed package changes no watched file, but the next request must not reuse the graph.
      fs.renameSync(rigFolder, installedRigFolder);
      await expectFallbackAsync('uninstalled');
      fs.renameSync(installedRigFolder, rigFolder);
      const reinstalled: ITerminalExchange = await runAsync(fixture, 'reinstalled', ['build', '--only', 'c']);
      expect(reinstalled.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(runs(fixture)).toEqual(['c:one:']);
    } finally {
      stderrWrite.mockRestore();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('rejects a missing project dependency file with the native instruction as the last line', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'direct', { pnpm: true });
    const dependencyFile: string = path.join(fixture.repoRoot, 'projects/c/.rush/temp/shrinkwrap-deps.json');
    const instruction: string =
      `A project dependency file (${dependencyFile}) is missing. ` +
      'You may need to run "rush install" or "rush update".';
    const expectRejectedAsync = async (requestId: string): Promise<void> => {
      const { terminal } = await runAsync(fixture, requestId, ['build', '--only', 'a']);
      expect(terminal).toMatchObject({ kind: 'requestRejected', payload: { code: 'routingFailed' } });
      const { message } = (terminal as { payload: { message: string } }).payload;
      expect(message.split('\n').pop()).toBe(instruction);
    };
    try {
      fs.rmSync(dependencyFile);
      await expectRejectedAsync('cold');
      expect(fixture.session.operationGraph).toBeUndefined();

      fs.writeFileSync(dependencyFile, '{}');
      const initial: ITerminalExchange = await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      expect(initial.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      fs.rmSync(dependencyFile);
      await expectRejectedAsync('warm');

      fs.writeFileSync(dependencyFile, '{}');
      const restored: ITerminalExchange = await runAsync(fixture, 'restored', ['build', '--only', 'a']);
      expect(restored.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });

      // A project added before "rush install" has no dependency file, so in-process Rush cannot hash the repo
      // state either. Its missing rig package must not hide that instruction.
      fs.rmSync(dependencyFile);
      fs.rmSync(path.join(fixture.repoRoot, 'projects/c/config/rush-project.json'));
      fs.writeFileSync(
        path.join(fixture.repoRoot, 'projects/c/config/rig.json'),
        '{"rigPackageName":"uninstalled-rig"}'
      );
      await expectRejectedAsync('added');
      expect(runs(fixture)).toEqual(['a:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('delivers buffered engine diagnostics even when the warm request schedules no work', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial', ['build', '--only', 'a']);
      const terminal: EngineTerminalProvider = new EngineTerminalProvider();
      terminal.attach(fixture.session.operationGraph!);
      terminal.write('snapshot-diagnostic', TerminalProviderSeverity.warning);
      const warm: ITerminalExchange = await runAsync(fixture, 'warm', ['build', '--only', 'a']);
      expect(warm.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      const events: string = warm.frames
        .filter((frame) => frame.kind === DaemonFrameType.event)
        .map((frame) => JSON.stringify(decodeDaemonEventFrame(frame.payload)))
        .join('\n');
      expect(events).toContain('snapshot-diagnostic');
      expect(runs(fixture)).toEqual(['a:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  const canRevokeReadAccess: boolean = process.platform !== 'win32' && process.getuid?.() !== 0;
  (canRevokeReadAccess ? it : it.skip)(
    'reports a warm snapshot failure to the failing request and never replays it into the next request',
    async () => {
      const fixture: IFixture = await createFixtureAsync();
      const inputPath: string = path.join(fixture.repoRoot, 'projects/a/input.txt');
      try {
        await runAsync(fixture, 'initial', ['build', '--only', 'a']);
        fs.writeFileSync(inputPath, 'unreadable');
        fs.chmodSync(inputPath, 0);
        const failed: ITerminalExchange = await runAsync(fixture, 'unreadable', ['build', '--only', 'a']);
        expect(failed.terminal).toMatchObject({
          kind: 'requestRejected',
          payload: {
            message: expect.stringMatching(
              /^Rush could not capture the next workspace inputs snapshot\.\n[\s\S]*Permission denied/
            )
          }
        });
        fs.chmodSync(inputPath, 0o644);
        const recovered: ITerminalExchange = await runAsync(fixture, 'recovered', ['build', '--only', 'a']);
        expect(recovered.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
        const output: string = [
          logText(recovered),
          ...recovered.frames
            .filter((frame) => frame.kind === DaemonFrameType.event)
            .map((frame) => JSON.stringify(decodeDaemonEventFrame(frame.payload)))
        ].join('\n');
        expect(output).not.toContain('Permission denied');
        expect(output).not.toContain('state of the repo');
      } finally {
        if (fs.existsSync(inputPath)) fs.chmodSync(inputPath, 0o644);
        await fixture[Symbol.asyncDispose]();
      }
    }
  );

  it('aborts an in-flight build with the typed daemon shutdown reason', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const gate: INativeScriptGate = await createNativeScriptGateAsync(fixture.repoRoot, 'a');
    try {
      const victim: Promise<ITerminalExchange> = runAsync(fixture, 'victim', ['build', '--only', 'a']);
      await gate.entered;
      const closing: Promise<void> = fixture.host.closeAsync(
        new DaemonShutdownError({ initiator: 'signal', signal: 'SIGTERM' })
      );
      await gate.releaseAsync();
      expect((await victim).terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          aborted: true,
          errorMessage: expect.stringMatching(
            /^The Rush daemon was shut down \(the daemon process received SIGTERM\) while this request was running; re-run the command\.$/
          )
        }
      });
      await closing;
    } finally {
      await gate.releaseAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('logs one native telemetry entry for each build request served by the warm engine', async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'direct', { telemetryEnabled: true });
    try {
      const beforeLogIndexes: unknown[] = [];
      const beforeLogRequestIndexes: unknown[] = [];
      for (const [requestId, argv] of [
        ['initial', ['build', '--only', 'a']],
        ['repeat', ['build', '--only', 'a']],
        ['consumer', ['build', '--to', 'b']]
      ] as const) {
        expect((await runAsync(fixture, requestId, [...argv])).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0 }
        });
        if (requestId === 'initial') {
          const { hooks } = fixture.session.operationGraph!;
          hooks.beforeLog.tap('test', (data: ITelemetryData) => {
            beforeLogIndexes.push(data.extraData?.requestIndex);
          });
          // Like a plugin that flags every entry that it is active, such as fstrace.
          hooks.beforeLogRequest.tap('test', (data: ITelemetryData) => {
            beforeLogRequestIndexes.push(data.extraData?.requestIndex);
            data.extraData!.pluginActive = true;
          });
        }
      }
      const entries: ITelemetryData[] = readTelemetryEntries(fixture.repoRoot);

      expect(entries).toHaveLength(3);
      expect(entries.map(({ name, result }) => [name, result])).toEqual([
        ['build', 'Succeeded'],
        ['build', 'Succeeded'],
        ['build', 'Succeeded']
      ]);
      expect(entries[0].extraData).toMatchObject({
        daemon: true,
        requestIndex: 1,
        graphWasInitialized: false,
        scheduled: true,
        durationBasis: 'iteration',
        isInitial: true,
        isWatch: false,
        command_only: 'true',
        '--only': 'a',
        countAll: 1,
        countSuccess: 1
      });
      expect(entries[1].extraData).toMatchObject({
        requestIndex: 2,
        graphWasInitialized: true,
        scheduled: false,
        durationBasis: 'batch',
        countAll: 1,
        countSkipped: 1,
        countRetained: 1
      });
      expect(entries[2].extraData).toMatchObject({
        requestIndex: 3,
        scheduled: true,
        command_only: 'false',
        command_to: 'true',
        '--to': 'b',
        countAll: 2,
        countSuccess: 1,
        countSkipped: 1,
        countRetained: 1
      });
      for (const entry of entries) {
        const totalSeconds: number = entry.extraData!.totalDurationSeconds as number;
        const requestMs: number = totalSeconds * 1000;
        expect(entry.durationInSeconds).toBeLessThanOrEqual(totalSeconds);
        expect(entry.extraData!.bootDurationSeconds).toBeLessThanOrEqual(totalSeconds);
        for (const { startTimestampMs, endTimestampMs } of Object.values(entry.operationResults!)) {
          expect(startTimestampMs).toBeGreaterThanOrEqual(0);
          expect(endTimestampMs).toBeLessThanOrEqual(requestMs);
        }
        expect(entry.performanceEntries?.map(({ name }) => name)).toContain('rush:daemon:resolve');
      }
      // The repeated request needed no iteration, so iteration-scoped beforeLog taps do not see its entry.
      expect(beforeLogIndexes).toEqual([3]);
      // beforeLogRequest taps see every entry, and what they add is logged.
      expect(beforeLogRequestIndexes).toEqual([2, 3]);
      expect(entries.map(({ extraData }) => extraData!.pluginActive)).toEqual([undefined, true, true]);
      expect(runs(fixture)).toEqual(['a:one:', 'b:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it("keeps serving when a request sets, changes or unsets its telemetry tag, and logs each request's own tag", async () => {
    const fixture: IFixture = await createFixtureAsync(false, 'direct', { telemetryEnabled: true });
    try {
      const tags: ReadonlyArray<readonly [string, string | undefined]> = [
        ['untagged', undefined],
        ['tagged', 'nightly-7'],
        ['retagged', 'nightly-8'],
        ['untagged-again', undefined]
      ];
      let session: WorkspaceSession | undefined;
      let graph: IOperationGraph | undefined;
      for (const [requestId, tag] of tags) {
        const environment: Record<string, string> = requestEnvironment();
        delete environment.RUSHD_TELEMETRY_TAG;
        if (tag !== undefined) environment.RUSHD_TELEMETRY_TAG = tag;
        expect(
          (await runAsync(fixture, requestId, ['build', '--only', 'a'], { environment })).terminal
        ).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
        session ??= fixture.session;
        graph ??= fixture.session.operationGraph;
        expect(fixture.session).toBe(session);
        expect(fixture.session.operationGraph).toBe(graph);
        expect(readDaemonLockfile(fixture.host.paths.lockfilePath)?.pid).toBe(process.pid);
      }

      const entries: ITelemetryData[] = readTelemetryEntries(fixture.repoRoot);
      expect(
        entries.map(({ extraData }) => [
          extraData?.requestId,
          extraData?.requestIndex,
          extraData?.graphWasInitialized,
          extraData?.telemetryTag
        ])
      ).toEqual([
        ['untagged', 1, false, undefined],
        ['tagged', 2, true, 'nightly-7'],
        ['retagged', 3, true, 'nightly-8'],
        ['untagged-again', 4, true, undefined]
      ]);
      expect(runs(fixture)).toEqual(['a:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('releases the lockfile within seconds when a flushTelemetry tap never settles', async () => {
    const stalledUploads: string[] = [];
    const createEngineAsync = PhasedCommandEngine.prototype.createEngineAsync;
    const createEngineSpy: jest.SpyInstance = jest
      .spyOn(PhasedCommandEngine.prototype, 'createEngineAsync')
      .mockImplementation(async function (
        this: PhasedCommandEngine,
        lock?: LockFile
      ): Promise<IPhasedCommandEngine> {
        const engine: IPhasedCommandEngine = await createEngineAsync.call(this, lock);
        // Like an upload to a server that accepts the connection and never answers.
        engine.rushSession.hooks.flushTelemetry.tapPromise('StalledUpload', (data) => {
          stalledUploads.push(...data.map(({ name }) => name));
          return new Promise<void>(() => undefined);
        });
        return engine;
      });
    const fixture: IFixture = await createFixtureAsync(false, 'direct', { telemetryEnabled: true });
    try {
      expect((await runAsync(fixture, 'initial', ['build', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect(stalledUploads).toEqual(['build']);

      const startMs: number = Date.now();
      await fixture.host.closeAsync();
      const elapsedMs: number = Date.now() - startMs;

      // The engine gives the upload 2 seconds, then the host releases its lockfile and socket, well before a
      // waiting client gives up on the handoff and falls back to in-process Rush.
      expect(elapsedMs).toBeGreaterThanOrEqual(1900);
      expect(elapsedMs).toBeLessThan(8000);
      expect(readDaemonLockfile(fixture.host.paths.lockfilePath)).toBeUndefined();
      expect(fs.existsSync(fixture.host.paths.socketPath)).toBe(false);
    } finally {
      createEngineSpy.mockRestore();
      await fixture[Symbol.asyncDispose]();
    }
  });
});
