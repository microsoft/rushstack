// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonRestartReason, IDaemonNativeLockHolder } from '@rushstack/rush-daemon-protocol';

import {
  RESTART_WAIT_REPEAT_MS,
  RESUBMITTED_PHASE,
  createDaemonRequestNoticeHandlers,
  type IDaemonRequestNoticeTarget
} from '../daemonRestartNotice';
import {
  NATIVE_LOCK_WAIT_REPEAT_MS,
  formatNativeLockWait,
  withNativeLockWaitNotices,
  type INativeLockWaitNoticeHandlers
} from '../nativeLockWaitNotice';

const INSTALL: IDaemonNativeLockHolder = { pid: 41, command: 'rush install' };
const UPDATE: IDaemonNativeLockHolder = { pid: 52, command: 'rush update' };
const LOCKFILE: DaemonRestartReason = {
  kind: 'workspaceInputsChanged',
  installationFiles: ['common/config/rush/pnpm-lock.yaml']
};
const INSTALL_LOCK: string = "another Rush process (PID 41: rush install) to release this repository's lock";
const UPDATE_LOCK: string = "another Rush process (PID 52: rush update) to release this repository's lock";

describe(formatNativeLockWait.name, () => {
  it('names the process that holds the lock as far as it is known, and from a second on, the time waited', () => {
    expect(formatNativeLockWait(INSTALL)).toBe(`waiting for ${INSTALL_LOCK}`);
    expect(formatNativeLockWait({ pid: 41 }, 999)).toBe(
      "waiting for another Rush process (PID 41) to release this repository's lock"
    );
    expect(formatNativeLockWait({}, 10_400)).toBe(
      "still waiting after 10s for another Rush process to release this repository's lock"
    );
  });
});

describe(withNativeLockWaitNotices.name, () => {
  let clock: number;

  beforeEach(() => {
    jest.useFakeTimers();
    clock = 0;
  });
  afterEach(() => jest.useRealTimers());

  function advance(ms: number): void {
    clock += ms;
    jest.advanceTimersByTime(ms);
  }

  function createHandlers(options: { agent: boolean; stderrIsTTY: boolean; rushx?: boolean }): {
    calls: string[];
    handlers: INativeLockWaitNoticeHandlers;
  } {
    const calls: string[] = [];
    const target: IDaemonRequestNoticeTarget = {
      rushx: !!options.rushx,
      stderrIsTTY: options.stderrIsTTY,
      daemonPid: 7,
      now: () => clock,
      agentRenderer: options.agent
        ? {
            note: (line: string) => calls.push(`note: ${line}`),
            onResubmitted: (phase: string) => calls.push(`resubmitted: ${phase}`),
            onQueuePosition: (position: number) => calls.push(`position: ${position}`),
            // A renderer may say whether it wrote the wait as a line.
            onRestartWait: (wait: string, announce: boolean) => {
              calls.push(`${announce ? 'announce' : 'wait'}: ${wait}`);
              return announce;
            }
          }
        : undefined,
      writeStderrAsync: async (text: string) => {
        calls.push(`stderr: ${text}`);
      }
    };
    return { calls, handlers: withNativeLockWaitNotices(createDaemonRequestNoticeHandlers(target), target) };
  }

  describe.each([
    ['rush-client', false],
    ['rushx-client', true]
  ])('%s without an agent renderer', (client: string, rushx: boolean) => {
    it('writes the wait line at once, on a pipe and a terminal', async () => {
      for (const stderrIsTTY of [false, true]) {
        const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY, rushx });
        await handlers.onQueuePositionAsync(1, undefined, {}, INSTALL);
        handlers.dispose();
        expect(calls).toEqual([`stderr: ${client}: waiting for ${INSTALL_LOCK}.\n`]);
      }
    });

    it('repeats the line with the time waited every 10 s, and at once when another process holds the lock', async () => {
      const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY: false, rushx });
      await handlers.onQueuePositionAsync(1, undefined, {}, INSTALL);
      advance(4000);
      await handlers.onQueuePositionAsync(1, undefined, {}, INSTALL);
      advance(NATIVE_LOCK_WAIT_REPEAT_MS - 4001);
      expect(calls).toHaveLength(1);
      advance(1);
      advance(2000);
      await handlers.onQueuePositionAsync(1, undefined, {}, UPDATE);
      advance(NATIVE_LOCK_WAIT_REPEAT_MS);
      handlers.dispose();
      advance(NATIVE_LOCK_WAIT_REPEAT_MS * 3);
      expect(calls).toEqual([
        `stderr: ${client}: waiting for ${INSTALL_LOCK}.\n`,
        `stderr: ${client}: still waiting after 10s for ${INSTALL_LOCK}.\n`,
        `stderr: ${client}: still waiting after 12s for ${UPDATE_LOCK}.\n`,
        `stderr: ${client}: still waiting after 22s for ${UPDATE_LOCK}.\n`
      ]);
      expect(calls.join('')).not.toContain('admission failed');
    });

    it('keeps naming the command of a process whose command can no longer be read, as once it exits', async () => {
      const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY: false, rushx });
      await handlers.onQueuePositionAsync(1, undefined, {}, INSTALL);
      advance(1000);
      await handlers.onQueuePositionAsync(1, undefined, {}, { pid: INSTALL.pid });
      advance(NATIVE_LOCK_WAIT_REPEAT_MS - 1000);
      await handlers.onQueuePositionAsync(1, undefined, {}, { pid: UPDATE.pid });
      handlers.dispose();
      expect(calls).toEqual([
        `stderr: ${client}: waiting for ${INSTALL_LOCK}.\n`,
        `stderr: ${client}: still waiting after 10s for ${INSTALL_LOCK}.\n`,
        `stderr: ${client}: still waiting after 10s for another Rush process (PID 52) to release this repository's lock.\n`
      ]);
    });
  });

  it.each([
    ['output or an event', (handlers: INativeLockWaitNoticeHandlers) => handlers.onRequestProgress(), []],
    ['input', (handlers: INativeLockWaitNoticeHandlers) => handlers.onInputAdmittedAsync(), []],
    [
      'a queue position',
      (handlers: INativeLockWaitNoticeHandlers) => handlers.onQueuePositionAsync(2),
      ['stderr: rush-client: waiting for daemon admission (position 2).\n']
    ],
    [
      'a queue position behind operations that an earlier failed command left running (task 108)',
      (handlers: INativeLockWaitNoticeHandlers) =>
        handlers.onQueuePositionAsync(1, undefined, {}, undefined, {
          count: 2,
          names: ['a (build)', 'b (build)']
        }),
      [
        'stderr: rush-client: waiting for daemon admission (position 1) behind 2 operations left running by an ' +
          'earlier failed command: a (build), b (build).\n'
      ]
    ],
    [
      'a restart',
      (handlers: INativeLockWaitNoticeHandlers) =>
        handlers.onRestartAsync({
          restart: 1,
          reason: { kind: 'installationChanged', change: 'removed', folder: '/snapshots/s9' },
          successorPid: 42
        }),
      [
        "stderr: rush-client: The daemon's installation at /snapshots/s9 was removed; restarted the daemon (PID 42).\n"
      ]
    ],
    [
      'a wait for a restart',
      (handlers: INativeLockWaitNoticeHandlers) => handlers.onQueuePositionAsync(1, LOCKFILE, {}),
      [
        'stderr: rush-client: waiting for 1 running request to finish; the daemon (PID 7) then restarts, because ' +
          'common/config/rush/pnpm-lock.yaml changed.\n'
      ]
    ],
    [
      'a wait for a restart that also names a process that holds the lock',
      (handlers: INativeLockWaitNoticeHandlers) => handlers.onQueuePositionAsync(1, LOCKFILE, {}, INSTALL),
      [
        'stderr: rush-client: waiting for 1 running request to finish; the daemon (PID 7) then restarts, because ' +
          'common/config/rush/pnpm-lock.yaml changed.\n'
      ]
    ]
  ])('stops when the request gets %s, whose own notice it gives', async (name, endAsync, notices) => {
    const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY: true });
    await handlers.onQueuePositionAsync(1, undefined, {}, INSTALL);
    await endAsync(handlers);
    advance(NATIVE_LOCK_WAIT_REPEAT_MS * 2);
    expect(calls).toEqual([`stderr: rush-client: waiting for ${INSTALL_LOCK}.\n`, ...notices]);
    handlers.dispose();
  });

  it('ends a wait for a daemon restart when the request waits for the lock instead', async () => {
    const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY: false });
    await handlers.onQueuePositionAsync(1, LOCKFILE, {});
    await handlers.onQueuePositionAsync(1, undefined, {}, INSTALL);
    advance(NATIVE_LOCK_WAIT_REPEAT_MS);
    advance(NATIVE_LOCK_WAIT_REPEAT_MS);
    // The restart wait line would have been repeated by now.
    advance(RESTART_WAIT_REPEAT_MS - 2 * NATIVE_LOCK_WAIT_REPEAT_MS);
    handlers.dispose();
    expect(calls).toEqual([
      'stderr: rush-client: waiting for 1 running request to finish; the daemon (PID 7) then restarts, because ' +
        'common/config/rush/pnpm-lock.yaml changed.\n',
      `stderr: rush-client: waiting for ${INSTALL_LOCK}.\n`,
      `stderr: rush-client: still waiting after 10s for ${INSTALL_LOCK}.\n`,
      `stderr: rush-client: still waiting after 20s for ${INSTALL_LOCK}.\n`
    ]);
  });

  it('writes nothing more once the request ends or the client asks rushd to cancel it', async () => {
    const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY: true });
    await handlers.onQueuePositionAsync(1, undefined, {}, INSTALL);
    handlers.dispose();
    await handlers.onQueuePositionAsync(1, undefined, {}, UPDATE);
    advance(NATIVE_LOCK_WAIT_REPEAT_MS * 3);
    expect(calls).toEqual([`stderr: rush-client: waiting for ${INSTALL_LOCK}.\n`]);
  });

  it('shows the wait as the agent phase, announcing each process that holds the lock, and writes no line', async () => {
    const { calls, handlers } = createHandlers({ agent: true, stderrIsTTY: false });
    await handlers.onQueuePositionAsync(1, undefined, {}, INSTALL);
    await handlers.onQueuePositionAsync(1, undefined, {}, INSTALL);
    advance(NATIVE_LOCK_WAIT_REPEAT_MS * 3);
    await handlers.onQueuePositionAsync(1, undefined, {}, UPDATE);
    handlers.onRequestProgress();
    handlers.dispose();
    await handlers.onQueuePositionAsync(1, undefined, {}, INSTALL);
    expect(calls).toEqual([`announce: waiting for ${INSTALL_LOCK}`, `announce: waiting for ${UPDATE_LOCK}`]);
  });

  it('gives the agent the resubmitted phase when the request follows a restart after it waited for the lock (task 108)', async () => {
    const { calls, handlers } = createHandlers({ agent: true, stderrIsTTY: false });
    await handlers.onQueuePositionAsync(1, undefined, {}, INSTALL);
    // The install changed the lockfile, so the daemon restarts at once, without a restart wait.
    await handlers.onRestartAsync({ restart: 1, reason: LOCKFILE, successorPid: 42 });
    // The request showed no wait at the new daemon, so its phase stays.
    await handlers.onRestartAsync({ restart: 2, reason: LOCKFILE, successorPid: 43 });
    await handlers.onQueuePositionAsync(1, undefined, {}, UPDATE);
    handlers.dispose();
    expect(calls).toEqual([
      `announce: waiting for ${INSTALL_LOCK}`,
      `resubmitted: ${RESUBMITTED_PHASE}`,
      `announce: waiting for ${UPDATE_LOCK}`
    ]);
  });

  it('announces a process once when its command can no longer be read, and names a command read later', async () => {
    const { calls, handlers } = createHandlers({ agent: true, stderrIsTTY: false });
    await handlers.onQueuePositionAsync(1, undefined, {}, INSTALL);
    await handlers.onQueuePositionAsync(1, undefined, {}, { pid: INSTALL.pid });
    await handlers.onQueuePositionAsync(1, undefined, {}, { pid: UPDATE.pid });
    await handlers.onQueuePositionAsync(1, undefined, {}, UPDATE);
    handlers.dispose();
    expect(calls).toEqual([
      `announce: waiting for ${INSTALL_LOCK}`,
      "announce: waiting for another Rush process (PID 52) to release this repository's lock",
      `announce: waiting for ${UPDATE_LOCK}`
    ]);
  });
});
