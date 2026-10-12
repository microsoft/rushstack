// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import {
  BACKGROUND_PREPARE_QUIET_MS,
  BackgroundPreparationScheduler,
  getCaptureEnvironmentKey,
  isSameCommandLine,
  type IPreparationCheck
} from '../BackgroundPreparationScheduler';
import { WorkspaceInvalidationTracker } from '../WorkspaceInvalidationTracker';
import type { IWorkspaceSession } from '../WorkspaceSession';

const DAEMON_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({ PATH: '/daemon/bin' });
const BUSY_LOG: string =
  "rushd: another Rush process holds this repository's lock; the daemon prepares in the background " +
  'once that process releases it';

function createSession(backgroundPrepare: boolean = true): IWorkspaceSession {
  return {
    rushConfiguration: { daemon: { backgroundPrepare } },
    invalidations: new WorkspaceInvalidationTracker()
  } as unknown as IWorkspaceSession;
}

function createEnvelope(overrides: Partial<IDaemonRequestEnvelope> = {}): IDaemonRequestEnvelope {
  return {
    requestId: 'request-1',
    commandName: 'build',
    commandOrigin: 'built-in',
    argv: ['build', '--to', 'b'],
    cwd: '/repo/b',
    environment: { PATH: '/client/bin', TRACEPARENT: '00-client-trace-01' },
    terminal: { isTTY: true, supportsColor: true, columns: 120 },
    admission: { waitTimeoutMs: 600_000 },
    returnEarlyOnFailure: true,
    ...overrides
  };
}

interface ITestScheduler {
  readonly scheduler: BackgroundPreparationScheduler;
  readonly checks: jest.Mock<Promise<void>, []>;
  readonly logs: string[];
}

function createScheduler(checkAsync: () => Promise<void> = async () => undefined): ITestScheduler {
  const checks: jest.Mock<Promise<void>, []> = jest.fn(checkAsync);
  const logs: string[] = [];
  const scheduler: BackgroundPreparationScheduler = new BackgroundPreparationScheduler({
    environment: DAEMON_ENVIRONMENT,
    checkAsync: checks,
    onLog: (message: string) => logs.push(message)
  });
  return { scheduler, checks, logs };
}

describe(BackgroundPreparationScheduler.name, () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('S1: checks once, when the remembered session has reported no change for the quiet period', () => {
    const { scheduler, checks } = createScheduler();
    const session: IWorkspaceSession = createSession();
    scheduler.remember(session, createEnvelope());
    jest.advanceTimersByTime(10 * BACKGROUND_PREPARE_QUIET_MS);
    expect(checks).not.toHaveBeenCalled();

    session.invalidations.invalidate('/repo/rush.json');
    jest.advanceTimersByTime(BACKGROUND_PREPARE_QUIET_MS - 1);
    session.invalidations.invalidate('/repo/common/config/rush/command-line.json');
    jest.advanceTimersByTime(BACKGROUND_PREPARE_QUIET_MS - 1);
    expect(checks).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(checks).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10 * BACKGROUND_PREPARE_QUIET_MS);
    expect(checks).toHaveBeenCalledTimes(1);
  });

  it("S2: keeps the command line with the daemon's environment, and nothing else of the request", () => {
    const { scheduler } = createScheduler();
    const session: IWorkspaceSession = createSession();
    const envelope: IDaemonRequestEnvelope = createEnvelope({ invocationKind: 'rush' });
    scheduler.remember(session, envelope);
    expect(scheduler.hint?.session).toBe(session);
    expect(scheduler.hint?.envelope).toStrictEqual({
      requestId: '',
      argv: ['build', '--to', 'b'],
      commandName: 'build',
      commandOrigin: 'built-in',
      cwd: '/repo/b',
      invocationKind: 'rush',
      environment: DAEMON_ENVIRONMENT,
      terminal: { isTTY: false, supportsColor: false }
    });
    expect(scheduler.hint?.envelope.argv).not.toBe(envelope.argv);
    scheduler.remember(session, createEnvelope());
    expect(scheduler.hint?.envelope).not.toHaveProperty('invocationKind');
  });

  it('S3: keeps nothing unless the workspace turns the setting on, or after it closes', () => {
    const { scheduler, checks } = createScheduler();
    const on: IWorkspaceSession = createSession();
    scheduler.remember(on, createEnvelope());
    const off: IWorkspaceSession = createSession(false);
    scheduler.remember(off, createEnvelope());
    expect(scheduler.hint).toBeUndefined();
    on.invalidations.invalidate('/repo/rush.json');
    off.invalidations.invalidate('/repo/rush.json');
    jest.advanceTimersByTime(10 * BACKGROUND_PREPARE_QUIET_MS);
    expect(checks).not.toHaveBeenCalled();

    scheduler.remember(on, createEnvelope());
    on.invalidations.invalidate('/repo/rush.json');
    scheduler.close();
    scheduler.remember(on, createEnvelope());
    expect(scheduler.hint).toBeUndefined();
    on.invalidations.invalidate('/repo/rush.json');
    jest.advanceTimersByTime(10 * BACKGROUND_PREPARE_QUIET_MS);
    expect(checks).not.toHaveBeenCalled();
  });

  it('S4: waits twice as long for each check while the lock is held, up to 60 s, and logs once per wait', () => {
    const { scheduler, checks, logs } = createScheduler();
    const session: IWorkspaceSession = createSession();
    scheduler.remember(session, createEnvelope());
    const waits: number[] = [];
    for (let i: number = 0; i < 8; i++) {
      const calls: number = checks.mock.calls.length;
      scheduler.retry();
      let waitedMs: number = 0;
      // Gives up after 2 minutes, so that a check that never comes fails this test instead of hanging it.
      while (checks.mock.calls.length === calls && waitedMs < 120_000) {
        jest.advanceTimersByTime(1000);
        waitedMs += 1000;
      }
      waits.push(waitedMs);
    }
    expect(waits).toEqual([2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000]);
    expect(logs).toEqual([BUSY_LOG]);

    const check: IPreparationCheck = { session, sequence: 0, boundSession: session, forceReload: false };
    for (const endWait of [() => scheduler.markChecked(check), () => scheduler.markPrepared()]) {
      endWait();
      const calls: number = checks.mock.calls.length;
      scheduler.retry();
      jest.advanceTimersByTime(1999);
      expect(checks).toHaveBeenCalledTimes(calls);
      jest.advanceTimersByTime(1);
      expect(checks).toHaveBeenCalledTimes(calls + 1);
    }
    expect(logs).toEqual([BUSY_LOG, BUSY_LOG, BUSY_LOG]);
  });

  it('S5: arms a check that was due while the daemon was busy once it is idle', () => {
    const { scheduler, checks } = createScheduler();
    scheduler.remember(createSession(), createEnvelope());
    scheduler.resume(true);
    jest.advanceTimersByTime(10 * BACKGROUND_PREPARE_QUIET_MS);
    expect(checks).not.toHaveBeenCalled();

    scheduler.defer();
    scheduler.resume(false);
    jest.advanceTimersByTime(10 * BACKGROUND_PREPARE_QUIET_MS);
    expect(checks).not.toHaveBeenCalled();
    scheduler.resume(true);
    jest.advanceTimersByTime(BACKGROUND_PREPARE_QUIET_MS - 1);
    expect(checks).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(checks).toHaveBeenCalledTimes(1);
    scheduler.resume(true);
    jest.advanceTimersByTime(10 * BACKGROUND_PREPARE_QUIET_MS);
    expect(checks).toHaveBeenCalledTimes(1);
  });

  it('S6: checks a new session for a change that its watcher reported after its capture', () => {
    const { scheduler, checks } = createScheduler();
    const quiet: IWorkspaceSession = createSession();
    scheduler.remember(quiet, createEnvelope(), quiet.invalidations.getSnapshot().sequence);
    jest.advanceTimersByTime(10 * BACKGROUND_PREPARE_QUIET_MS);
    expect(checks).not.toHaveBeenCalled();

    const changed: IWorkspaceSession = createSession();
    const capturedSequence: number = changed.invalidations.getSnapshot().sequence;
    changed.invalidations.invalidate('/repo/rush.json');
    scheduler.remember(changed, createEnvelope(), capturedSequence);
    jest.advanceTimersByTime(BACKGROUND_PREPARE_QUIET_MS - 1);
    expect(checks).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(checks).toHaveBeenCalledTimes(1);

    // The same session again: its changes since the subscription were already due.
    scheduler.remember(changed, createEnvelope(), capturedSequence);
    jest.advanceTimersByTime(10 * BACKGROUND_PREPARE_QUIET_MS);
    expect(checks).toHaveBeenCalledTimes(1);
  });

  it('S7: records the state in which a check found nothing to do, until the session changes', () => {
    const { scheduler } = createScheduler();
    const session: IWorkspaceSession = createSession();
    const other: IWorkspaceSession = createSession();
    scheduler.remember(session, createEnvelope());
    const check: IPreparationCheck = { session, sequence: 3, boundSession: session, forceReload: false };
    expect(scheduler.isChecked(check)).toBe(false);
    scheduler.markChecked(check);
    expect(scheduler.isChecked({ ...check })).toBe(true);
    for (const changed of [
      { session: other },
      { sequence: 4 },
      { boundSession: other },
      { boundSession: undefined },
      { forceReload: true }
    ]) {
      expect(scheduler.isChecked({ ...check, ...changed })).toBe(false);
    }
    scheduler.remember(session, createEnvelope({ argv: ['build'] }));
    expect(scheduler.isChecked(check)).toBe(true);
    scheduler.remember(other, createEnvelope());
    expect(scheduler.isChecked(check)).toBe(false);
  });

  it('S8: forgets the command line, its pending check and its subscription', () => {
    const { scheduler, checks } = createScheduler();
    const session: IWorkspaceSession = createSession();
    scheduler.remember(session, createEnvelope());
    session.invalidations.invalidate('/repo/rush.json');
    scheduler.forget();
    expect(scheduler.hint).toBeUndefined();
    jest.advanceTimersByTime(10 * BACKGROUND_PREPARE_QUIET_MS);
    session.invalidations.invalidate('/repo/rush.json');
    scheduler.defer();
    scheduler.resume(true);
    scheduler.retry();
    jest.advanceTimersByTime(10 * BACKGROUND_PREPARE_QUIET_MS);
    expect(checks).not.toHaveBeenCalled();
  });

  it('S9: logs a check that fails', async () => {
    const { scheduler, logs } = createScheduler(async () => {
      throw new Error('the capture failed');
    });
    const session: IWorkspaceSession = createSession();
    scheduler.remember(session, createEnvelope());
    session.invalidations.invalidate('/repo/rush.json');
    await jest.advanceTimersByTimeAsync(BACKGROUND_PREPARE_QUIET_MS);
    expect(logs).toEqual(['rushd: could not check whether to prepare in the background: the capture failed']);
  });
});

describe(isSameCommandLine.name, () => {
  it('S10: compares the command line and working directory, and nothing else', () => {
    const envelope: IDaemonRequestEnvelope = createEnvelope();
    expect(
      isSameCommandLine(
        envelope,
        createEnvelope({
          requestId: 'request-2',
          environment: {},
          terminal: { isTTY: false, supportsColor: false }
        })
      )
    ).toBe(true);
    for (const changed of [
      { argv: ['build', '--to', 'c'] },
      { argv: ['build', '--to'] },
      { argv: ['build', '--to', 'b', '--verbose'] },
      { cwd: '/repo' },
      { commandName: 'rebuild' },
      { commandOrigin: 'custom' as const },
      { invocationKind: 'rush' as const }
    ]) {
      expect(isSameCommandLine(envelope, createEnvelope(changed))).toBe(false);
      expect(isSameCommandLine(createEnvelope(changed), envelope)).toBe(false);
    }
  });
});

describe(getCaptureEnvironmentKey.name, () => {
  it('S11: ignores variables that no workspace capture reads', () => {
    const environment: Record<string, string> = { PATH: '/bin', MY_TOOL_FLAG: '1' };
    const key: string = getCaptureEnvironmentKey(environment);
    expect(getCaptureEnvironmentKey({ ...environment, TRACEPARENT: '00-trace-01' })).toBe(key);
    expect(getCaptureEnvironmentKey({ ...environment, MY_TOOL_FLAG: '2' })).not.toBe(key);
    expect(getCaptureEnvironmentKey({ ...environment, RUSH_PREVIEW_VERSION: '5.0.0' })).not.toBe(key);
  });
});
