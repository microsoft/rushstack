// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonRestartReason } from '@rushstack/rush-daemon-protocol';

import {
  RESUBMITTED_PHASE,
  createDaemonRequestNoticeHandlers,
  createDaemonRestartNoticeHandler,
  formatDaemonRestartNotice,
  formatDaemonRestartWait,
  type IDaemonRequestNoticeHandlers
} from '../daemonRestartNotice';

// A kind that only a newer daemon knows.
const NEWER_REASON: DaemonRestartReason = { kind: 'environmentChanged' } as unknown as DaemonRestartReason;

describe(formatDaemonRestartNotice.name, () => {
  it('names the changed installation and the new daemon', () => {
    expect(
      formatDaemonRestartNotice(
        {
          restart: 1,
          reason: { kind: 'installationChanged', change: 'replaced', folder: '/snapshots/s9' },
          successorPid: 42
        },
        false
      )
    ).toBe(
      "rush-client: The daemon's installation at /snapshots/s9 was replaced; restarted the daemon (PID 42)."
    );
    expect(
      formatDaemonRestartNotice(
        {
          restart: 1,
          reason: { kind: 'installationChanged', change: 'removed', folder: '/snapshots/s9' },
          successorPid: undefined
        },
        true
      )
    ).toBe("rushx-client: The daemon's installation at /snapshots/s9 was removed; restarted the daemon.");
  });

  it('says nothing about restarts that need no explanation', () => {
    expect(
      formatDaemonRestartNotice({ restart: 1, reason: undefined, successorPid: 42 }, false)
    ).toBeUndefined();
    expect(
      formatDaemonRestartNotice({ restart: 1, reason: NEWER_REASON, successorPid: 42 }, false)
    ).toBeUndefined();
  });
});

describe(createDaemonRestartNoticeHandler.name, () => {
  const notice = {
    restart: 1,
    reason: { kind: 'installationChanged', change: 'removed', folder: '/snapshots/s9' },
    successorPid: 42
  } as const;
  const line: string =
    "rush-client: The daemon's installation at /snapshots/s9 was removed; restarted the daemon (PID 42).";

  it('gives the line to the agent renderer when one is active', async () => {
    const notes: string[] = [];
    const written: string[] = [];
    const handler = createDaemonRestartNoticeHandler({
      rushx: false,
      agentRenderer: { note: (text: string) => notes.push(text) },
      writeStderrAsync: async (text: string) => {
        written.push(text);
      }
    });
    await handler(notice);
    expect(notes).toEqual([line]);
    expect(written).toEqual([]);
  });

  it('writes the line to stderr without an agent renderer, and stays quiet for other restarts', async () => {
    const written: string[] = [];
    const handler = createDaemonRestartNoticeHandler({
      rushx: false,
      agentRenderer: undefined,
      writeStderrAsync: async (text: string) => {
        written.push(text);
      }
    });
    await handler(notice);
    await handler({ restart: 2, reason: undefined, successorPid: 43 });
    expect(written).toEqual([`${line}\n`]);
  });
});

const REMOVED: DaemonRestartReason = {
  kind: 'installationChanged',
  change: 'removed',
  folder: '/snapshots/s9'
};

describe(formatDaemonRestartWait.name, () => {
  it('says what the request waits for, and why the daemon then restarts', () => {
    expect(formatDaemonRestartWait(2, REMOVED, 41)).toBe(
      'waiting for the running requests to finish (position 2); the daemon (PID 41) then restarts, because ' +
        'its installation at /snapshots/s9 was removed'
    );
    expect(formatDaemonRestartWait(1, { ...REMOVED, change: 'replaced' }, undefined)).toBe(
      'waiting for the running requests to finish (position 1); the daemon then restarts, because its ' +
        'installation at /snapshots/s9 was replaced'
    );
  });

  it('says nothing about plain queue positions or reasons that it does not know', () => {
    expect(formatDaemonRestartWait(1, undefined, 41)).toBeUndefined();
    expect(formatDaemonRestartWait(1, NEWER_REASON, 41)).toBeUndefined();
  });
});

describe(createDaemonRequestNoticeHandlers.name, () => {
  function createHandlers(options: { agent: boolean; stderrIsTTY: boolean; rushx?: boolean }): {
    calls: string[];
    handlers: IDaemonRequestNoticeHandlers;
  } {
    const calls: string[] = [];
    const handlers: IDaemonRequestNoticeHandlers = createDaemonRequestNoticeHandlers({
      rushx: !!options.rushx,
      stderrIsTTY: options.stderrIsTTY,
      daemonPid: 41,
      agentRenderer: options.agent
        ? {
            note: (line: string) => calls.push(`note: ${line}`),
            setPhase: (phase: string) => calls.push(`phase: ${phase}`),
            onQueuePosition: (position: number) => calls.push(`position: ${position}`)
          }
        : undefined,
      writeStderrAsync: async (text: string) => {
        calls.push(`stderr: ${text}`);
      }
    });
    return { calls, handlers };
  }

  it('shows a restart wait as the agent phase, and names the new daemon after the restart', async () => {
    const { calls, handlers } = createHandlers({ agent: true, stderrIsTTY: false });
    await handlers.onQueuePositionAsync(2);
    await handlers.onQueuePositionAsync(1, REMOVED);
    await handlers.onRestartAsync({ restart: 1, reason: REMOVED, successorPid: 42 });
    await handlers.onQueuePositionAsync(1, REMOVED);
    expect(calls).toEqual([
      'position: 2',
      `phase: ${formatDaemonRestartWait(1, REMOVED, 41)}`,
      "note: rush-client: The daemon's installation at /snapshots/s9 was removed; restarted the daemon (PID 42).",
      `phase: ${RESUBMITTED_PHASE}`,
      `phase: ${formatDaemonRestartWait(1, REMOVED, 42)}`
    ]);
  });

  it('keeps the agent phase after a restart that the request did not wait for', async () => {
    const { calls, handlers } = createHandlers({ agent: true, stderrIsTTY: false });
    await handlers.onQueuePositionAsync(1);
    await handlers.onRestartAsync({ restart: 1, reason: undefined, successorPid: 42 });
    expect(calls).toEqual(['position: 1']);
  });

  it('writes every queue position to a terminal', async () => {
    const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY: true });
    await handlers.onQueuePositionAsync(2);
    await handlers.onQueuePositionAsync(2, REMOVED);
    await handlers.onQueuePositionAsync(1, REMOVED);
    expect(calls).toEqual([
      'stderr: rush-client: waiting for daemon admission (position 2).\n',
      `stderr: rush-client: ${formatDaemonRestartWait(2, REMOVED, 41)}.\n`,
      `stderr: rush-client: ${formatDaemonRestartWait(1, REMOVED, 41)}.\n`
    ]);
  });

  it('writes only the first restart wait for each daemon to a pipe', async () => {
    const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY: false, rushx: true });
    await handlers.onQueuePositionAsync(3);
    await handlers.onQueuePositionAsync(2, REMOVED);
    await handlers.onQueuePositionAsync(1, REMOVED);
    await handlers.onRestartAsync({ restart: 1, reason: undefined, successorPid: 42 });
    await handlers.onQueuePositionAsync(1, REMOVED);
    expect(calls).toEqual([
      `stderr: rushx-client: ${formatDaemonRestartWait(2, REMOVED, 41)}.\n`,
      `stderr: rushx-client: ${formatDaemonRestartWait(1, REMOVED, 42)}.\n`
    ]);
  });
});
