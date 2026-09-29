// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setImmediate as setImmediateAsync, setTimeout as setTimeoutAsync } from 'node:timers/promises';

import { WorkspaceInputChangeTier } from '@microsoft/rush-lib';
import type { LockFile } from '@rushstack/node-core-library';
import {
  DaemonFrameType,
  decodeDaemonLogChunk,
  type IDaemonCommandResult,
  type IDaemonFrame,
  type IDaemonInstallationChange
} from '@rushstack/rush-daemon-protocol';
import type { DaemonFrameListener } from '@rushstack/rush-daemon-transport';

import { DaemonWireRequestClient } from '../DaemonWireRequestClient';
import * as linuxProcessGroupExit from '../LinuxProcessGroupExit';
import * as installationState from '../NativeMutationInstallationState';
import { tryAcquireNativeLock } from '../NativeRepositoryLock';
import type { GetWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import { WorkspaceRequestResourceCleanupError } from '../WorkspaceRequestResources';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import type { ITerminalExchange } from './DaemonRequestWireTestUtilities';
import { captureTestDaemonListenerAsync } from './TestDaemonListener';
import { removeTestFolderAsync } from './TestProcessExit';
import { setDaemonPolicy } from './WarmGenerationTestUtilities';

jest.setTimeout(60_000);

const FLAG: string = 'common/temp/last-install.flag';
const HOTLINK_STATE: string = 'common/temp/rush-hotlink-state.json';
const NO_SUCCESSOR: string = 'No successor was expected.';
const JOIN_FAILURE: string = 'The worker process group could not be joined.';
/** So that a flag that is written again never has the times of the first one. */
const OLD_TIME: Date = new Date('2000-01-01T00:00:00Z');
/** How long a test waits for a restart that should have been requested, before it fails. */
const RESTART_WAIT_MS: number = 10_000;

function outputText(exchange: ITerminalExchange): string {
  return exchange.frames
    .filter(
      (frame: IDaemonFrame) =>
        frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr
    )
    .map((frame: IDaemonFrame) => Buffer.from(decodeDaemonLogChunk(frame.payload).chunk).toString())
    .join('');
}

function keptLine(commandName: string, exitCode: number): string {
  return (
    `rushd: "rush ${commandName}" failed (exit code ${exitCode}) before it changed the installation, so this ` +
    'daemon keeps running and reloads the workspace for the next request'
  );
}

function keptLines(logs: ReadonlyArray<string>): string[] {
  return logs.filter((line: string) => line.includes('keeps running'));
}

async function isSettledAsync(promise: Promise<unknown>): Promise<boolean> {
  let settled: boolean = false;
  promise.then(
    () => (settled = true),
    () => (settled = true)
  );
  await setImmediateAsync();
  return settled;
}

interface IExpectRestartOptions {
  /** How many daemon log lines came before the request, so that keep lines logged earlier are not counted. */
  earlierLogCount?: number;
  /**
   * Whether the daemon decided to restart as the worker exited, so the command's output says why no successor
   * starts. A decision that is made once the worker's processes were joined comes after the output.
   */
  explained?: boolean;
}

/** Returns how the restart ended, so that a daemon that was wrongly kept fails its test before the test times out. */
async function getRestartOutcomeAsync(
  restartCompleted: Promise<unknown>
): Promise<{ error?: unknown } | 'none'> {
  const timeout: AbortController = new AbortController();
  try {
    return await Promise.race([
      restartCompleted.then(
        () => ({}),
        (error: unknown) => ({ error })
      ),
      setTimeoutAsync(RESTART_WAIT_MS, 'none' as const, { signal: timeout.signal })
    ]);
  } finally {
    timeout.abort();
  }
}

describe('a native install or update that fails', () => {
  const current: { change?: IDaemonInstallationChange } = {};
  let fixture: DaemonGraphTestFixture | undefined;
  let listener: DaemonFrameListener | undefined;
  let launcher: jest.MockedFunction<GetWorkspaceSuccessorLaunchAsync>;
  let workerSpawns: number;
  /** Called as the native mutation worker is spawned, after the request's last check before it runs. */
  let onWorkerSpawn: () => void;

  beforeEach(() => {
    current.change = undefined;
    fixture = undefined;
    listener = undefined;
    workerSpawns = 0;
    onWorkerSpawn = () => undefined;
    // A mutation requires a successor launcher. This one never starts a daemon, so a restart ends the host.
    launcher = jest.fn<
      ReturnType<GetWorkspaceSuccessorLaunchAsync>,
      Parameters<GetWorkspaceSuccessorLaunchAsync>
    >(() => Promise.reject(new Error(NO_SUCCESSOR)));
    const nativeChildProcess: typeof childProcess = jest.requireActual('node:child_process');
    const spawn: typeof childProcess.spawn = nativeChildProcess.spawn;
    jest.spyOn(nativeChildProcess, 'spawn').mockImplementation(((
      ...args: Parameters<typeof childProcess.spawn>
    ) => {
      if (args[1]?.some((arg: string) => arg.endsWith(`${path.sep}NativeMutationWorker.js`))) {
        workerSpawns++;
        onWorkerSpawn();
      }
      return spawn(...args);
    }) as typeof childProcess.spawn);
    // The host reports a restart without a successor as a warning.
    jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (!fixture) return;
    try {
      await fixture.host.closeAsync();
    } catch (error) {
      // A daemon whose worker could not be joined keeps its listener, which only the test may release.
      if (!(error instanceof WorkspaceRequestResourceCleanupError)) throw error;
      await listener?.closeAsync();
    } finally {
      await fixture.host.restartCompleted.catch(() => undefined);
      await removeTestFolderAsync(fixture.folder, true);
    }
  });

  /** Starts a daemon on a workspace that was installed, unless `configure` says otherwise, and loads its graph. */
  async function startAsync(
    configure?: (created: DaemonGraphTestFixture) => void
  ): Promise<DaemonGraphTestFixture> {
    const captured: { value: DaemonGraphTestFixture; listener: DaemonFrameListener } =
      await captureTestDaemonListenerAsync(() =>
        DaemonGraphTestFixture.createAsync((starting: DaemonGraphTestFixture) => {
          setDaemonPolicy(starting, {});
          starting.checkInstallation = () => current.change;
          starting.getSuccessorLaunchAsync = launcher;
          starting.write(FLAG, JSON.stringify({ node: process.versions.node, packageManager: 'npm' }));
          fs.utimesSync(path.join(starting.folder, FLAG), OLD_TIME, OLD_TIME);
          configure?.(starting);
        })
      );
    const started: DaemonGraphTestFixture = captured.value;
    fixture = started;
    listener = captured.listener;
    await started.buildSuccessfullyAsync();
    return started;
  }

  function file(name: string): string {
    return path.join(fixture!.folder, name);
  }

  function rewriteFlag(): void {
    const content: Buffer = fs.readFileSync(file(FLAG));
    fs.rmSync(file(FLAG));
    fs.writeFileSync(file(FLAG), content);
  }

  async function expectKeptAsync(
    exchange: ITerminalExchange,
    commandName: string = 'install'
  ): Promise<void> {
    const started: DaemonGraphTestFixture = fixture!;
    expect(exchange.terminal).toMatchObject({ kind: 'requestResult' });
    const { exitCode } = exchange.terminal.payload as IDaemonCommandResult;
    expect(exitCode).not.toBe(0);
    expect(exchange.terminal.payload).not.toHaveProperty('retryAfterRestart');
    expect(workerSpawns).toBe(1);
    // The session is still current: a request that doesn't load the graph again is served on it. It is admitted only
    // once the mutation's request has ended, so the daemon has decided by then.
    expect((await started.graphAsync('status')).terminal).toMatchObject({
      kind: 'requestResult',
      payload: { exitCode: 0 }
    });
    expect(keptLines(started.logs)).toEqual([keptLine(commandName, exitCode)]);
    await started.buildSuccessfullyAsync();
    expect(started.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Reload);
    expect(launcher).not.toHaveBeenCalled();
    expect(await isSettledAsync(started.host.restartCompleted)).toBe(false);
    expect(await isSettledAsync(started.host.closed)).toBe(false);
  }

  async function expectRestartAsync(
    exchange: ITerminalExchange,
    { earlierLogCount = 0, explained = true }: IExpectRestartOptions = {}
  ): Promise<void> {
    const started: DaemonGraphTestFixture = fixture!;
    expect(exchange.terminal).toMatchObject({ kind: 'requestResult' });
    expect(exchange.terminal.payload).not.toHaveProperty('retryAfterRestart');
    expect(workerSpawns).toBe(1);
    const explanation: string = `Mutation completed, but successor startup is unavailable: ${NO_SUCCESSOR}`;
    if (explained) expect(outputText(exchange)).toContain(explanation);
    else expect(outputText(exchange)).not.toContain(explanation);
    expect(await getRestartOutcomeAsync(started.host.restartCompleted)).toEqual({
      error: expect.objectContaining({ message: NO_SUCCESSOR })
    });
    expect(launcher).toHaveBeenCalledTimes(1);
    await started.host.closed;
    expect(keptLines(started.logs.slice(earlierLogCount))).toEqual([]);
  }

  it('keeps the daemon when install fails on common/scripts, and restarts after an install that succeeds', async () => {
    const started: DaemonGraphTestFixture = await startAsync();
    const exchange: ITerminalExchange = await started.runAsync(['install']);
    expect(outputText(exchange)).toContain('common/scripts');
    await expectKeptAsync(exchange);

    // --help runs the real worker, which changes nothing and exits 0. An install that succeeds still restarts.
    workerSpawns = 0;
    const earlierLogCount: number = started.logs.length;
    await expectRestartAsync(await started.runAsync(['install', '--help']), { earlierLogCount });
  });

  it('keeps the daemon when update fails, as install does', async () => {
    const started: DaemonGraphTestFixture = await startAsync();
    // An unknown parameter fails before update writes anything, even common/scripts.
    await expectKeptAsync(await started.runAsync(['update', '--no-such-parameter']), 'update');
  });

  it('keeps the daemon for each of two failed installs, the second queued behind the first', async () => {
    const started: DaemonGraphTestFixture = await startAsync();
    const exchanges: ITerminalExchange[] = await Promise.all([
      started.runAsync(['install']),
      started.runAsync(['install'])
    ]);
    for (const { terminal } of exchanges) {
      expect(terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 1 } });
      expect(terminal.payload).not.toHaveProperty('retryAfterRestart');
    }
    expect(workerSpawns).toBe(2);
    await started.buildSuccessfullyAsync();
    expect(keptLines(started.logs)).toEqual([keptLine('install', 1), keptLine('install', 1)]);
    expect(started.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Reload);
    expect(launcher).not.toHaveBeenCalled();
    expect(await isSettledAsync(started.host.restartCompleted)).toBe(false);
  });

  it('keeps the daemon when install finds the Rush lock held', async () => {
    const started: DaemonGraphTestFixture = await startAsync();
    const lock: LockFile | undefined = tryAcquireNativeLock(file('common/temp'));
    expect(lock).toBeDefined();
    let exchange: ITerminalExchange;
    try {
      exchange = await started.runAsync(['install']);
    } finally {
      lock?.release();
    }
    expect(outputText(exchange)).toContain('Another Rush command is already running in this repository.');
    await expectKeptAsync(exchange);
  });

  it('restarts when the failed install wrote the flag again with the same content', async () => {
    const started: DaemonGraphTestFixture = await startAsync();
    onWorkerSpawn = rewriteFlag;
    await expectRestartAsync(await started.runAsync(['install']));
  });

  it('restarts when the failed install deleted the flag', async () => {
    const started: DaemonGraphTestFixture = await startAsync();
    onWorkerSpawn = () => fs.rmSync(file(FLAG));
    await expectRestartAsync(await started.runAsync(['install']));
  });

  it('restarts when the workspace has a hotlink, which an install deletes before the flag', async () => {
    const started: DaemonGraphTestFixture = await startAsync((starting: DaemonGraphTestFixture) => {
      starting.write(
        HOTLINK_STATE,
        JSON.stringify({
          fileVersion: 0,
          linksBySubspace: {
            default: [{ linkedPackagePath: starting.folder, linkedPackageName: 'x', linkType: 'LinkPackage' }]
          }
        })
      );
    });
    await expectRestartAsync(await started.runAsync(['install']));
  });

  it('keeps the daemon when the hotlink state records no link', async () => {
    const started: DaemonGraphTestFixture = await startAsync((starting: DaemonGraphTestFixture) => {
      starting.write(HOTLINK_STATE, JSON.stringify({ fileVersion: 0, linksBySubspace: {} }));
    });
    await expectKeptAsync(await started.runAsync(['install']));
  });

  it('restarts when the workspace had no flag before the install', async () => {
    const started: DaemonGraphTestFixture = await startAsync((starting: DaemonGraphTestFixture) => {
      fs.rmSync(path.join(starting.folder, FLAG));
    });
    await expectRestartAsync(await started.runAsync(['install']));
  });

  it('restarts after an install that succeeds', async () => {
    const started: DaemonGraphTestFixture = await startAsync();
    await expectRestartAsync(await started.runAsync(['install', '--help']));
  });

  it('restarts when a process-bound installation file changed during the failed install', async () => {
    const started: DaemonGraphTestFixture = await startAsync();
    onWorkerSpawn = () =>
      fs.writeFileSync(
        file('common/config/rush/npm-shrinkwrap.json'),
        '{"lockfileVersion":3,"packages":{"x":{}}}'
      );
    await expectRestartAsync(await started.runAsync(['install']));
  });

  it("exits without a successor when the daemon's installation changed during the failed install", async () => {
    const started: DaemonGraphTestFixture = await startAsync();
    const folder: string = file('installation');
    onWorkerSpawn = () => {
      current.change ??= { change: 'replaced', folder };
    };
    const exchange: ITerminalExchange = await started.runAsync(['install']);
    expect(workerSpawns).toBe(1);
    expect(outputText(exchange)).toContain(
      `The daemon's installation at ${folder} was replaced, so the daemon exits after this command without ` +
        'starting a new one; the next command starts one.'
    );
    expect(launcher).not.toHaveBeenCalled();
    await expect(started.host.restartCompleted).resolves.toBeUndefined();
    expect(keptLines(started.logs)).toEqual([]);
  });

  it('keeps the daemon when the result of a failed install could not be delivered', async () => {
    const started: DaemonGraphTestFixture = await startAsync();
    // The result is lost, as it is when the client's connection fails while the worker runs.
    jest
      .spyOn(DaemonWireRequestClient.prototype, 'writeResultAsync')
      .mockRejectedValueOnce(new Error('The connection to the client failed.'));
    const { terminal } = await started.runAsync(['install']);
    expect(terminal.kind).toBe('requestRejected');
    expect(workerSpawns).toBe(1);
    await started.buildSuccessfullyAsync();
    expect(keptLines(started.logs)).toEqual([keptLine('install', 1)]);
    expect(launcher).not.toHaveBeenCalled();
    expect(await isSettledAsync(started.host.restartCompleted)).toBe(false);
  });

  it('restarts when the flag changed after the worker exited, before its processes were joined', async () => {
    const started: DaemonGraphTestFixture = await startAsync();
    const captureAsync: typeof installationState.captureNativeMutationInstallationStateAsync =
      installationState.captureNativeMutationInstallationStateAsync;
    let captures: number = 0;
    jest
      .spyOn(installationState, 'captureNativeMutationInstallationStateAsync')
      .mockImplementation(async (...args: Parameters<typeof captureAsync>) => {
        const state: installationState.INativeMutationInstallationState | undefined = await captureAsync(
          ...args
        );
        // The first capture is before the worker starts and the second as it exits. A process that the worker started,
        // which the daemon ends only after that, then writes the flag again with the same content, which the input
        // fingerprint doesn't see.
        if (++captures === 2) rewriteFlag();
        return state;
      });
    await expectRestartAsync(await started.runAsync(['install']), { explained: false });
    expect(captures).toBe(3);
  });

  (process.platform === 'linux' ? it : it.skip)(
    'restarts when the processes of the failed install could not be joined',
    async () => {
      const started: DaemonGraphTestFixture = await startAsync();
      const waitAsync: typeof linuxProcessGroupExit.waitForLinuxProcessGroupExitAsync =
        linuxProcessGroupExit.waitForLinuxProcessGroupExitAsync;
      let joins: number = 0;
      jest
        .spyOn(linuxProcessGroupExit, 'waitForLinuxProcessGroupExitAsync')
        .mockImplementation(async (...args: Parameters<typeof waitAsync>) => {
          // The group really exits, but the daemon can't tell, so the worker's processes may still be running.
          await waitAsync(...args);
          joins++;
          throw new Error(JOIN_FAILURE);
        });
      const exchange: ITerminalExchange = await started.runAsync(['install']);
      expect(exchange.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { outcome: 'failure', errorMessage: expect.stringContaining(JOIN_FAILURE) }
      });
      expect(joins).toBe(1);
      expect(workerSpawns).toBe(1);
      // As after any mutation whose worker was not joined, the daemon keeps its ownership of the workspace.
      expect(await getRestartOutcomeAsync(started.host.restartCompleted)).toEqual({
        error: expect.any(WorkspaceRequestResourceCleanupError)
      });
      expect(launcher).toHaveBeenCalledTimes(1);
      expect(keptLines(started.logs)).toEqual([]);
    }
  );
});
