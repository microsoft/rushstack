// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import {
  DaemonFrameType,
  decodeDaemonControlMessage,
  type DaemonControlMessage,
  type IDaemonCommandResult,
  type IDaemonFrame,
  type IDaemonInstallationChange,
  type IDaemonRequestEnvelope,
  type IDaemonRequestQueuePositionMessage
} from '@rushstack/rush-daemon-protocol';

import { captureDaemonInstallation, type CheckDaemonInstallation } from '../DaemonInstallationMonitor';
import { getInstalledWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import type { WorkspaceSession } from '../WorkspaceSession';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import {
  createDeferred,
  type DaemonRequestWireClient,
  type IDeferred,
  type ITerminalExchange
} from './DaemonRequestWireTestUtilities';
import { assertSuccessfulNativeBuild } from './NativeBuildTestResult';
import { pongAsync, setDaemonPolicy } from './WarmGenerationTestUtilities';
import { stopSuccessorAsync } from './WorkspaceLifecycleTestProcess';

jest.setTimeout(30_000);

const BUILD_B: string[] = ['build', '--to', 'b', '--parallelism', '3'];
const LONG_BUILD_A: string =
  "const fs=require('node:fs');fs.appendFileSync('../runs.txt','a\\n');" +
  "const wait=()=>fs.existsSync('../common/temp/release.flag')?console.log('finished-a'):setTimeout(wait,20);" +
  'wait();';
// A script such as a dev server, which runs until it is stopped.
const SERVE_A: string =
  "const fs=require('node:fs');fs.appendFileSync('../runs.txt','serve\\n');" +
  "const wait=()=>fs.existsSync('../common/temp/release.flag')?console.log('stopped'):setTimeout(wait,20);" +
  'wait();';

function queuePositions(
  frames: ReadonlyArray<IDaemonFrame>
): IDaemonRequestQueuePositionMessage['payload'][] {
  return frames
    .filter((frame: IDaemonFrame) => frame.kind === DaemonFrameType.controlJson)
    .map((frame: IDaemonFrame) => decodeDaemonControlMessage(frame.payload))
    .filter((message: DaemonControlMessage) => message.kind === 'queuePosition')
    .map((message: DaemonControlMessage) => (message as IDaemonRequestQueuePositionMessage).payload);
}

async function readUntilQueuedAsync(client: DaemonRequestWireClient): Promise<IDaemonFrame[]> {
  const frames: IDaemonFrame[] = [];
  while (queuePositions(frames).length === 0) frames.push(await client.readFrameAsync());
  return frames;
}

async function waitForAsync(predicate: () => boolean): Promise<void> {
  while (!predicate()) await delayAsync(20);
}

interface IInstallation {
  readonly root: string;
  readonly folder: string;
  readonly lib: string;
}

function createInstallation(): IInstallation {
  const root: string = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-installation-')));
  const folder: string = path.join(root, 'daemon');
  const lib: string = path.join(folder, 'lib-commonjs');
  fs.mkdirSync(lib, { recursive: true });
  return { root, folder, lib };
}

describe(captureDaemonInstallation.name, () => {
  let installation: IInstallation;
  beforeEach(() => {
    installation = createInstallation();
  });
  afterEach(() => {
    fs.rmSync(installation.root, { recursive: true, force: true });
  });

  it('ignores files that change inside the folders', () => {
    const check: CheckDaemonInstallation = captureDaemonInstallation([installation.lib]);
    fs.writeFileSync(path.join(installation.lib, 'index.js'), '');
    fs.mkdirSync(path.join(installation.lib, 'nested'));
    fs.rmSync(path.join(installation.lib, 'index.js'));
    expect(check()).toBeUndefined();
  });

  it('reports the outermost folder that was renamed away, and nothing once it is back', () => {
    const check: CheckDaemonInstallation = captureDaemonInstallation([installation.lib]);
    fs.renameSync(installation.folder, `${installation.folder}.moved`);
    expect(check()).toEqual({ change: 'removed', folder: installation.folder });
    fs.renameSync(`${installation.folder}.moved`, installation.folder);
    expect(check()).toBeUndefined();
  });

  it('reports a folder that another folder took the place of', () => {
    const check: CheckDaemonInstallation = captureDaemonInstallation([installation.lib]);
    // The old folder stays on disk, so the new one cannot reuse its inode.
    fs.renameSync(installation.folder, `${installation.folder}.old`);
    fs.mkdirSync(installation.lib, { recursive: true });
    expect(check()).toEqual({ change: 'replaced', folder: installation.folder });
  });

  it('reports only the innermost folder when its parents are intact', () => {
    const check: CheckDaemonInstallation = captureDaemonInstallation([installation.folder, installation.lib]);
    fs.renameSync(installation.lib, `${installation.lib}.old`);
    fs.mkdirSync(installation.lib);
    expect(check()).toEqual({ change: 'replaced', folder: installation.lib });
    fs.rmSync(installation.lib, { recursive: true });
    expect(check()).toEqual({ change: 'removed', folder: installation.lib });
  });

  it('does not watch a folder that was missing at startup', () => {
    const missing: string = path.join(installation.root, 'missing');
    const check: CheckDaemonInstallation = captureDaemonInstallation([missing]);
    fs.mkdirSync(missing);
    expect(check()).toBeUndefined();
  });
});

describe('a daemon whose installation changed', () => {
  let installation: IInstallation;
  let fixture: DaemonGraphTestFixture | undefined;
  beforeEach(() => {
    installation = createInstallation();
  });
  afterEach(async () => {
    const created: DaemonGraphTestFixture | undefined = fixture;
    fixture = undefined;
    await created?.[Symbol.asyncDispose]();
    fs.rmSync(installation.root, { recursive: true, force: true });
  });

  it('asks the client to start a new daemon, exits without a successor, and says why', async () => {
    fixture = await DaemonGraphTestFixture.createAsync((created) => {
      setDaemonPolicy(created, {});
      created.checkInstallation = captureDaemonInstallation([installation.lib]);
    });
    await fixture.buildSuccessfullyAsync();
    expect(fixture.runs()).toEqual(['a', 'b']);
    expect((await pongAsync(fixture)).installationChange).toBeUndefined();

    fs.renameSync(installation.folder, `${installation.folder}.moved`);
    expect((await pongAsync(fixture)).installationChange).toEqual({
      change: 'removed',
      folder: installation.folder
    });
    const { terminal } = await fixture.buildAsync();
    expect(terminal.kind).toBe('requestResult');
    const result: IDaemonCommandResult = terminal.payload as IDaemonCommandResult;
    expect(result).toMatchObject({
      exitCode: 1,
      outcome: 'failure',
      aborted: false,
      retryAfterRestart: true,
      restartReason: { kind: 'installationChanged', change: 'removed', folder: installation.folder }
    });
    expect(result.errorMessage).toContain(`installation at ${installation.folder} was removed`);

    await expect(fixture.host.restartCompleted).resolves.toBeUndefined();
    await fixture.host.closed;
    expect(fixture.runs()).toEqual(['a', 'b']);
    expect(fixture.logs).toEqual([
      `rushd: the installation at ${installation.folder} was removed; exiting once running requests finish, ` +
        'so that the next client starts a new daemon'
    ]);
  });

  it('answers a request that arrives during a running build once that build finishes', async () => {
    const current: { change?: IDaemonInstallationChange } = {};
    fixture = await DaemonGraphTestFixture.createAsync((created) => {
      setDaemonPolicy(created, {});
      created.checkInstallation = () => current.change;
      created.write('a/build.cjs', LONG_BUILD_A);
    });
    const running: Promise<ITerminalExchange> = fixture.buildAsync();
    await waitForAsync(() => fixture!.runs().includes('a'));
    current.change = { change: 'replaced', folder: installation.folder };

    // The build runs for longer than a client-default wait timeout, which must not fail the request.
    let answered: boolean = false;
    const queued: Promise<ITerminalExchange> = fixture
      .runAsync(BUILD_B, { admission: { waitTimeoutMs: 100, waitTimeoutIsDefault: true } })
      .finally(() => {
        answered = true;
      });
    let restarted: boolean = false;
    void fixture.host.restartCompleted.then(() => {
      restarted = true;
    });
    expect((await pongAsync(fixture)).installationChange).toEqual(current.change);
    await delayAsync(300);
    expect(answered).toBe(false);
    expect(restarted).toBe(false);

    fixture.write('common/temp/release.flag', '');
    assertSuccessfulNativeBuild(await running, fixture.session.operationGraph);
    const { frames, terminal } = await queued;
    const restartReason: object = {
      kind: 'installationChanged',
      change: 'replaced',
      folder: installation.folder
    };
    expect(terminal.payload).toMatchObject({ retryAfterRestart: true, restartReason });
    expect(queuePositions(frames)).toEqual([expect.objectContaining({ position: 1, restartReason })]);
    await expect(fixture.host.restartCompleted).resolves.toBeUndefined();
    await fixture.host.closed;
    expect(fixture.runs()).toEqual(['a', 'b']);
    expect(fixture.logs).toHaveLength(1);
  });

  it('applies an explicit wait timeout to that wait, and restarts for a later request', async () => {
    const current: { change?: IDaemonInstallationChange } = {};
    fixture = await DaemonGraphTestFixture.createAsync((created) => {
      setDaemonPolicy(created, {});
      created.checkInstallation = () => current.change;
      created.write('a/build.cjs', LONG_BUILD_A);
    });
    const running: Promise<ITerminalExchange> = fixture.buildAsync();
    await waitForAsync(() => fixture!.runs().includes('a'));
    current.change = { change: 'removed', folder: installation.folder };

    const timedOut: ITerminalExchange = await fixture.runAsync(BUILD_B, {
      admission: { waitTimeoutMs: 100 }
    });
    expect(timedOut.terminal).toMatchObject({
      kind: 'requestResult',
      payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
    });
    expect((timedOut.terminal.payload as IDaemonCommandResult).retryAfterRestart).toBeUndefined();
    const notWaiting: ITerminalExchange = await fixture.runAsync(BUILD_B, { admission: { noWait: true } });
    expect(notWaiting.terminal).toMatchObject({ payload: { exitCode: 1, admissionErrorCode: 'no-wait' } });

    fixture.write('common/temp/release.flag', '');
    assertSuccessfulNativeBuild(await running, fixture.session.operationGraph);
    let restarted: boolean = false;
    void fixture.host.restartCompleted.then(() => {
      restarted = true;
    });
    await delayAsync(100);
    expect(restarted).toBe(false);

    const { terminal } = await fixture.buildAsync();
    expect(terminal.payload).toMatchObject({
      retryAfterRestart: true,
      restartReason: { kind: 'installationChanged', change: 'removed', folder: installation.folder }
    });
    await expect(fixture.host.restartCompleted).resolves.toBeUndefined();
    await fixture.host.closed;
    expect(fixture.runs()).toEqual(['a', 'b']);
  });

  it('still applies a client-default timeout to that wait while a rushx script runs, and says why', async () => {
    const current: { change?: IDaemonInstallationChange } = {};
    fixture = await DaemonGraphTestFixture.createAsync((created) => {
      setDaemonPolicy(created, {});
      created.checkInstallation = () => current.change;
      created.servesRushx = true;
      created.write(
        'a/package.json',
        JSON.stringify({
          name: 'a',
          version: '1.0.0',
          scripts: { '_phase:compile': 'node build.cjs', serve: 'node serve.cjs' }
        })
      );
      created.write('a/serve.cjs', SERVE_A);
    });
    const serving: Promise<ITerminalExchange> = fixture.runAsync(['serve'], {
      invocationKind: 'rushx',
      commandOrigin: 'custom',
      cwd: path.join(fixture.folder, 'a')
    });
    await Promise.race([
      waitForAsync(() => fixture!.runs().includes('serve')),
      serving.then((exchange: ITerminalExchange) => {
        throw new Error(`The script ended before it ran: ${JSON.stringify(exchange.terminal)}`);
      })
    ]);
    current.change = { change: 'replaced', folder: installation.folder };

    const timedOut: ITerminalExchange = await fixture.runAsync(BUILD_B, {
      admission: { waitTimeoutMs: 100, waitTimeoutIsDefault: true }
    });
    expect(timedOut.terminal).toMatchObject({
      kind: 'requestResult',
      payload: { exitCode: 1, admissionErrorCode: 'wait-timeout' }
    });
    const result: IDaemonCommandResult = timedOut.terminal.payload as IDaemonCommandResult;
    expect(result.retryAfterRestart).toBeUndefined();
    expect(result.errorMessage).toContain(
      `could restart because its installation at ${installation.folder} was replaced, which waits for the ` +
        'requests that the daemon is serving to finish, including a rushx script that may not exit until it is ' +
        'stopped. Stop the script, or use --wait-timeout <seconds> to wait longer.'
    );

    fixture.write('common/temp/release.flag', '');
    expect((await serving).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    const { terminal } = await fixture.buildAsync();
    expect(terminal.payload).toMatchObject({
      retryAfterRestart: true,
      restartReason: { kind: 'installationChanged', change: 'replaced', folder: installation.folder }
    });
    await expect(fixture.host.restartCompleted).resolves.toBeUndefined();
    await fixture.host.closed;
    expect(fixture.runs()).toEqual(['serve']);
  });

  it('answers a request that waited behind a graph load with the restart instead of running it', async () => {
    const current: { change?: IDaemonInstallationChange } = {};
    fixture = await DaemonGraphTestFixture.createAsync((created) => {
      setDaemonPolicy(created, {});
      created.checkInstallation = () => current.change;
    });
    const loadStarted: IDeferred<void> = createDeferred<void>();
    const releaseLoad: IDeferred<void> = createDeferred<void>();
    // Only the first build's graph load waits; the one that shuts the daemon down does not.
    let loaded: boolean = false;
    fixture.beforeCreateSessionAsync = async () => {
      if (loaded) return;
      loaded = true;
      loadStarted.resolve();
      await releaseLoad.promise;
    };
    const loading: Promise<ITerminalExchange> = fixture.buildAsync();
    await loadStarted.promise;
    const client: DaemonRequestWireClient = await fixture.connectAsync();
    try {
      const envelope: IDaemonRequestEnvelope = fixture.envelope(BUILD_B);
      await client.sendControlAsync({ kind: 'requestStart', payload: envelope });
      const frames: IDaemonFrame[] = await readUntilQueuedAsync(client);
      current.change = { change: 'removed', folder: installation.folder };
      releaseLoad.resolve();

      // The load was admitted before the change, so its build runs on the code that is already loaded.
      assertSuccessfulNativeBuild(await loading, fixture.session.operationGraph);
      const exchange: ITerminalExchange = await client.readTerminalAsync(envelope.requestId);
      expect(exchange.terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          retryAfterRestart: true,
          restartReason: { kind: 'installationChanged', change: 'removed', folder: installation.folder }
        }
      });
      expect(queuePositions([...frames, ...exchange.frames])[0]).not.toHaveProperty('restartReason');
    } finally {
      releaseLoad.resolve();
      await client.closeAsync();
    }
    await expect(fixture.host.restartCompleted).resolves.toBeUndefined();
    expect(fixture.runs()).toEqual(['a', 'b']);
  });

  it('answers a request that waited to reload the graph with the restart instead of reloading', async () => {
    const current: { change?: IDaemonInstallationChange } = {};
    fixture = await DaemonGraphTestFixture.createAsync((created) => {
      setDaemonPolicy(created, {});
      created.checkInstallation = () => current.change;
      created.write('a/build.cjs', LONG_BUILD_A);
    });
    const running: Promise<ITerminalExchange> = fixture.buildAsync();
    await waitForAsync(() => fixture!.runs().includes('a'));
    const packageJsonPath: string = path.join(fixture.folder, 'c/package.json');
    const packageJson: Record<string, unknown> = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    fs.writeFileSync(packageJsonPath, JSON.stringify({ ...packageJson, description: 'changed' }));
    const client: DaemonRequestWireClient = await fixture.connectAsync();
    try {
      // Needs a reload, so it waits for exclusive admission until the running build ends.
      const envelope: IDaemonRequestEnvelope = fixture.envelope(BUILD_B);
      await client.sendControlAsync({ kind: 'requestStart', payload: envelope });
      await readUntilQueuedAsync(client);
      current.change = { change: 'replaced', folder: installation.folder };
      fixture.write('common/temp/release.flag', '');

      assertSuccessfulNativeBuild(await running, fixture.session.operationGraph);
      expect((await client.readTerminalAsync(envelope.requestId)).terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          retryAfterRestart: true,
          restartReason: { kind: 'installationChanged', change: 'replaced', folder: installation.folder }
        }
      });
    } finally {
      await client.closeAsync();
    }
    await expect(fixture.host.restartCompleted).resolves.toBeUndefined();
    expect(fixture.runs()).toEqual(['a', 'b']);
  });

  it('answers a request that the change broke before it began with the restart', async () => {
    const current: { change?: IDaemonInstallationChange } = {};
    fixture = await DaemonGraphTestFixture.createAsync((created) => {
      setDaemonPolicy(created, {});
      created.checkInstallation = () => current.change;
    });
    // Only the first build's graph load fails; the one that shuts the daemon down succeeds.
    fixture.beforeCreateSessionAsync = async () => {
      if (current.change) return;
      current.change = { change: 'removed', folder: installation.folder };
      throw new Error("Cannot find module 'validate-npm-package-name'");
    };
    const { terminal } = await fixture.buildAsync();
    expect(terminal).toMatchObject({
      kind: 'requestResult',
      payload: {
        retryAfterRestart: true,
        restartReason: { kind: 'installationChanged', change: 'removed', folder: installation.folder }
      }
    });
    await expect(fixture.host.restartCompleted).resolves.toBeUndefined();
    await fixture.host.closed;
    expect(fixture.runs()).toEqual([]);
    expect(fixture.logs).toEqual([
      `rushd: the installation at ${installation.folder} was removed; exiting once running requests finish, ` +
        'so that the next client starts a new daemon'
    ]);
  });

  it('answers a graph watch that arrives after the change with the restart, like any other request', async () => {
    const current: { change?: IDaemonInstallationChange } = {};
    fixture = await DaemonGraphTestFixture.createAsync((created) => {
      setDaemonPolicy(created, {});
      created.checkInstallation = () => current.change;
    });
    await fixture.buildSuccessfullyAsync();
    current.change = { change: 'removed', folder: installation.folder };

    // A watch has no restart ticket, since a restart cancels it, until it waits for this restart itself.
    const { terminal } = await fixture.graphAsync('watch');
    expect(terminal).toMatchObject({
      kind: 'requestResult',
      payload: {
        retryAfterRestart: true,
        restartReason: { kind: 'installationChanged', change: 'removed', folder: installation.folder }
      }
    });
    await expect(fixture.host.restartCompleted).resolves.toBeUndefined();
    expect(fixture.runs()).toEqual(['a', 'b']);
  });

  it.each([
    { kind: 'a graph control request', argv: ['daemon', 'graph', 'pause'] },
    { kind: 'a build', argv: BUILD_B }
  ])(
    'answers $kind that waited to restart the daemon for its inputs with the restart for a change during that wait',
    async ({ argv }: { argv: string[] }) => {
      const current: { change?: IDaemonInstallationChange } = {};
      const created: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync((configured) => {
        setDaemonPolicy(configured, {});
        configured.checkInstallation = () => current.change;
        configured.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
      });
      fixture = created;
      try {
        await created.buildSuccessfullyAsync();
        // Another install state needs a new daemon process, so the request would select a successor.
        created.write('common/temp/last-install.flag', '{}');
        // The installation changes after the request's last check before its waits end, while the warm set stops.
        const session: WorkspaceSession = created.session;
        const quiesceAsync: () => Promise<void> = session.quiesceWarmSetAsync.bind(session);
        jest.spyOn(session, 'quiesceWarmSetAsync').mockImplementation(async () => {
          current.change ??= { change: 'replaced', folder: installation.folder };
          await quiesceAsync();
        });

        const { terminal } = await created.runAsync(argv);
        expect(terminal).toMatchObject({
          kind: 'requestResult',
          payload: {
            retryAfterRestart: true,
            restartReason: { kind: 'installationChanged', change: 'replaced', folder: installation.folder }
          }
        });
        // The daemon exits without a successor, which each client then starts with its own launcher.
        await expect(created.host.restartCompleted).resolves.toBeUndefined();
        expect(created.runs()).toEqual(['a', 'b']);
      } finally {
        jest.restoreAllMocks();
        await created.host.closeAsync();
        await created.host.restartCompleted;
        await stopSuccessorAsync(created.host.paths);
      }
    }
  );

  it('keeps serving while its installation is intact', async () => {
    fixture = await DaemonGraphTestFixture.createAsync((created) => {
      setDaemonPolicy(created, {});
      created.checkInstallation = captureDaemonInstallation([installation.lib]);
    });
    await fixture.buildSuccessfullyAsync();
    fs.writeFileSync(path.join(installation.lib, 'late.js'), '');
    await fixture.buildSuccessfullyAsync();
    expect(fixture.logs).toEqual([]);
  });
});

it('logs each rejected request, with the stack of an unexpected failure', async () => {
  const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync();
  try {
    const { terminal } = await fixture.graphAsync('pause');
    expect(terminal).toMatchObject({ kind: 'requestRejected', payload: { code: 'routingFailed' } });
    const { requestId, message } = terminal.payload as { requestId: string; message: string };
    expect(fixture.logs).toHaveLength(1);
    expect(fixture.logs[0]).toMatch(
      new RegExp(`^rushd: rejected request ${requestId} \\(routingFailed\\): `)
    );
    expect(fixture.logs[0]).toContain(message);
    expect(fixture.logs[0]).toMatch(/\n\s+at /);
  } finally {
    await fixture[Symbol.asyncDispose]();
  }
});
