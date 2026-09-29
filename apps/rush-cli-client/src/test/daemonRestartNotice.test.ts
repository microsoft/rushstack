// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DaemonClientError,
  DaemonRestartFailedError,
  type IDaemonRestartWaitDetails
} from '@rushstack/rush-client-core';
import type { DaemonRestartReason } from '@rushstack/rush-daemon-protocol';

import {
  RESTART_WAIT_REPEAT_MS,
  RESUBMITTED_PHASE,
  createDaemonRequestNoticeHandlers,
  createDaemonRestartNoticeHandler,
  explainDaemonRestartFailure,
  formatDaemonRestartNotice,
  formatDaemonRestartWait,
  type IDaemonRequestNoticeHandlers
} from '../daemonRestartNotice';

// A kind that only a newer daemon knows.
const NEWER_REASON: DaemonRestartReason = {
  kind: 'newerReason',
  detail: ['NODE_OPTIONS']
} as unknown as DaemonRestartReason;

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

  it("names the variables in which a command's environment differed, at most four of them", () => {
    const format = (
      variableNames: string[],
      successorPid: number | undefined,
      rushx: boolean
    ): string | undefined =>
      formatDaemonRestartNotice(
        { restart: 1, reason: { kind: 'environmentChanged', variableNames }, successorPid },
        rushx
      );
    expect(format(['NODE_OPTIONS'], 42, false)).toBe(
      "rush-client: A command's environment differed from the daemon's in NODE_OPTIONS; " +
        'restarted the daemon (PID 42).'
    );
    expect(format(['FOO', 'NODE_OPTIONS'], undefined, true)).toBe(
      "rushx-client: A command's environment differed from the daemon's in FOO and NODE_OPTIONS; " +
        'restarted the daemon.'
    );
    expect(format(['A', 'B', 'C', 'D'], 42, false)).toContain("the daemon's in A, B, C and D; restarted");
    expect(format(['A', 'B', 'C', 'D', 'E', 'F'], 42, false)).toContain(
      "the daemon's in A, B, C, D and 2 more; restarted"
    );
    expect(format([], 42, false)).toBe(
      "rush-client: A command's environment differed from the daemon's; restarted the daemon (PID 42)."
    );
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

describe(explainDaemonRestartFailure.name, () => {
  const startupError: DaemonClientError = new DaemonClientError(
    'startupFailed',
    'Daemon startup has an unresolved startup handoff at /run/rushd.pid.json.starting.'
  );

  it('says first why the daemon restarted, and keeps the code and the startup error', () => {
    const explain = (reason: DaemonRestartReason): unknown =>
      explainDaemonRestartFailure(new DaemonRestartFailedError(startupError, reason));
    const environment: unknown = explain({ kind: 'environmentChanged', variableNames: ['NODE_OPTIONS'] });
    expect(environment).toBeInstanceOf(DaemonClientError);
    expect(environment).toMatchObject({
      code: 'startupFailed',
      message:
        "A command's environment differed from the daemon's in NODE_OPTIONS; the restarted daemon did not " +
        'start: Daemon startup has an unresolved startup handoff at /run/rushd.pid.json.starting.'
    });
    const { cause } = environment as DaemonClientError;
    expect(cause).toBeInstanceOf(DaemonRestartFailedError);
    expect((cause as DaemonRestartFailedError).cause).toBe(startupError);
    expect(
      (explain({ kind: 'installationChanged', change: 'removed', folder: '/snapshots/s9' }) as Error).message
    ).toBe(
      "The daemon's installation at /snapshots/s9 was removed; the restarted daemon did not start: " +
        'Daemon startup has an unresolved startup handoff at /run/rushd.pid.json.starting.'
    );
  });

  it('returns any other error, and a restart for a reason that this client does not know, unchanged', () => {
    const newer: DaemonRestartFailedError = new DaemonRestartFailedError(startupError, NEWER_REASON);
    const other: Error = new Error('other');
    expect(explainDaemonRestartFailure(newer)).toBe(newer);
    expect(explainDaemonRestartFailure(startupError)).toBe(startupError);
    expect(explainDaemonRestartFailure(other)).toBe(other);
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
const LOCKFILE: DaemonRestartReason = {
  kind: 'workspaceInputsChanged',
  installationFiles: ['common/config/rush/pnpm-lock.yaml']
};
const PLUGIN_CODE: DaemonRestartReason = {
  kind: 'workspaceInputsChanged',
  implementationFiles: ['common/autoinstallers/p/node_modules/q/lib/x.js']
};
const ANOTHER: IDaemonRestartWaitDetails = { restartsForAnotherRequest: true };

// One case for each reason that a daemon gives for a restart, and how a waiting request and a waiting rushx script
// word it.
const REASONS: [string, DaemonRestartReason, string, string][] = [
  [
    'a removed installation',
    REMOVED,
    'because its installation at /snapshots/s9 was removed',
    "because the daemon's installation at /snapshots/s9 was removed"
  ],
  [
    'an environment',
    { kind: 'environmentChanged', variableNames: ['NODE_OPTIONS', 'RUSH_X'] },
    "because this request's environment differs from the daemon's in NODE_OPTIONS and RUSH_X",
    "because its environment differs from the daemon's in NODE_OPTIONS and RUSH_X"
  ],
  [
    'a lockfile',
    LOCKFILE,
    'because common/config/rush/pnpm-lock.yaml changed',
    'because common/config/rush/pnpm-lock.yaml changed'
  ],
  [
    'plugin code',
    PLUGIN_CODE,
    'because the code of Rush or a Rush plugin changed (common/autoinstallers/p/node_modules/q/lib/x.js)',
    'because the code of Rush or a Rush plugin changed (common/autoinstallers/p/node_modules/q/lib/x.js)'
  ],
  [
    'a Rush version',
    { kind: 'workspaceInputsChanged', selectedRushVersion: '5.180.0' },
    'because this request selects Rush 5.180.0',
    'because it selects Rush 5.180.0'
  ]
];

describe(formatDaemonRestartWait.name, () => {
  it.each(REASONS)('says why the daemon restarts for %s', (name, reason, cause, anotherCause) => {
    expect(formatDaemonRestartWait({ position: 1, reason, details: {}, daemonPid: 41 })).toBe(
      `waiting for 1 running request to finish; the daemon (PID 41) then restarts, ${cause}`
    );
    expect(formatDaemonRestartWait({ position: 2, reason, details: ANOTHER, daemonPid: 41 })).toBe(
      `waiting for the daemon (PID 41) to restart for another request (2 requests ahead), ${anotherCause}`
    );
  });

  it('says how many of the requests that it waits for run a rushx script', () => {
    const format = (position: number, details: IDaemonRestartWaitDetails): string =>
      formatDaemonRestartWait({ position, reason: LOCKFILE, details, daemonPid: undefined });
    expect(format(3, { scriptCount: 1 })).toBe(
      'waiting for 3 running requests to finish, including 1 rushx script; the daemon then restarts, because ' +
        'common/config/rush/pnpm-lock.yaml changed'
    );
    expect(format(3, { scriptCount: 2 })).toMatch(
      /^waiting for 3 running requests to finish, including 2 rushx scripts;/
    );
    expect(format(1, { scriptCount: 1 })).toMatch(
      /^waiting for 1 running rushx script to finish; the daemon then/
    );
    expect(format(2, { scriptCount: 2 })).toMatch(/^waiting for 2 running rushx scripts to finish;/);
    expect(format(2, { scriptCount: 0 })).toMatch(/^waiting for 2 running requests to finish;/);
    expect(format(1, { ...ANOTHER, scriptCount: 0 })).toMatch(
      /restart for another request \(1 request ahead\), /
    );
    expect(format(3, { ...ANOTHER, scriptCount: 1 })).toMatch(
      /^waiting for the daemon to restart for another request \(3 requests ahead, including 1 rushx script\), /
    );
  });

  it('says how long the request has waited, from a second on', () => {
    const format = (elapsedMs: number, details: IDaemonRestartWaitDetails): string =>
      formatDaemonRestartWait({ position: 1, reason: LOCKFILE, details, daemonPid: 41, elapsedMs });
    expect(format(999, {})).toMatch(/^waiting for 1 running request/);
    expect(format(25_400, {})).toMatch(
      /^still waiting after 25s for 1 running request to finish; the daemon/
    );
    expect(format(50_000, ANOTHER)).toMatch(
      /^still waiting after 50s for the daemon \(PID 41\) to restart for/
    );
  });

  it('leaves out a cause that it cannot word', () => {
    expect(formatDaemonRestartWait({ position: 2, reason: NEWER_REASON, details: {}, daemonPid: 41 })).toBe(
      'waiting for 2 running requests to finish; the daemon (PID 41) then restarts'
    );
    expect(
      formatDaemonRestartWait({ position: 2, reason: NEWER_REASON, details: ANOTHER, daemonPid: 41 })
    ).toBe('waiting for the daemon (PID 41) to restart for another request (2 requests ahead)');
  });
});

describe(createDaemonRequestNoticeHandlers.name, () => {
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

  function createHandlers(options: {
    agent: boolean;
    stderrIsTTY: boolean;
    rushx?: boolean;
    // Whether the agent renderer writes an announced wait as a line, as it does on a pipe.
    agentWritesWaitLines?: boolean;
  }): {
    calls: string[];
    handlers: IDaemonRequestNoticeHandlers;
  } {
    const calls: string[] = [];
    const agentWritesWaitLines: boolean = options.agentWritesWaitLines ?? true;
    const handlers: IDaemonRequestNoticeHandlers = createDaemonRequestNoticeHandlers({
      rushx: !!options.rushx,
      stderrIsTTY: options.stderrIsTTY,
      daemonPid: 41,
      now: () => clock,
      agentRenderer: options.agent
        ? {
            note: (line: string) => calls.push(`note: ${line}`),
            setPhase: (phase: string) => calls.push(`phase: ${phase}`),
            onQueuePosition: (position: number) => calls.push(`position: ${position}`),
            onRestartWait: (wait: string, announce: boolean) => {
              calls.push(`${announce ? 'announce' : 'wait'}: ${wait}`);
              return announce && agentWritesWaitLines;
            }
          }
        : undefined,
      writeStderrAsync: async (text: string) => {
        calls.push(`stderr: ${text}`);
      }
    });
    return { calls, handlers };
  }

  const LOCKFILE_WAIT: string =
    'the daemon (PID 41) then restarts, because common/config/rush/pnpm-lock.yaml changed';
  const ENV_NODE_OPTIONS: DaemonRestartReason = {
    kind: 'environmentChanged',
    variableNames: ['NODE_OPTIONS']
  };
  const ENV_BOTH: DaemonRestartReason = {
    kind: 'environmentChanged',
    variableNames: ['NODE_OPTIONS', 'RUSH_X']
  };
  const REPLACED: DaemonRestartReason = {
    kind: 'installationChanged',
    change: 'replaced',
    folder: '/snapshots/s9'
  };
  const REMOVED_S10: DaemonRestartReason = {
    kind: 'installationChanged',
    change: 'removed',
    folder: '/snapshots/s10'
  };

  describe.each([
    ['rush-client', false],
    ['rushx-client', true]
  ])('%s without an agent renderer', (client: string, rushx: boolean) => {
    it.each(REASONS)(
      'writes the first line of a wait for %s at once, on a pipe and a terminal',
      async (name, reason, cause) => {
        for (const stderrIsTTY of [false, true]) {
          const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY, rushx });
          await handlers.onQueuePositionAsync(1, reason, { scriptCount: 0 });
          handlers.dispose();
          expect(calls).toEqual([
            `stderr: ${client}: waiting for 1 running request to finish; the daemon (PID 41) then restarts, ${cause}.\n`
          ]);
        }
      }
    );

    it('repeats the line with the time waited when 25 s pass without one, until the restart', async () => {
      const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY: false, rushx });
      advance(3000);
      await handlers.onQueuePositionAsync(2, LOCKFILE, { scriptCount: 1 });
      advance(10_000);
      // On a pipe, a new count waits for the next line.
      await handlers.onQueuePositionAsync(1, LOCKFILE, {});
      advance(RESTART_WAIT_REPEAT_MS - 10_001);
      expect(calls).toHaveLength(1);
      advance(1);
      advance(RESTART_WAIT_REPEAT_MS);
      await handlers.onRestartAsync({ restart: 1, reason: undefined, successorPid: 42 });
      advance(RESTART_WAIT_REPEAT_MS * 4);
      expect(calls).toEqual([
        `stderr: ${client}: waiting for 2 running requests to finish, including 1 rushx script; ${LOCKFILE_WAIT}.\n`,
        `stderr: ${client}: still waiting after 25s for 1 running request to finish; ${LOCKFILE_WAIT}.\n`,
        `stderr: ${client}: still waiting after 50s for 1 running request to finish; ${LOCKFILE_WAIT}.\n`
      ]);
    });

    it('writes a line on a pipe at once when the cause changes, and every change on a terminal', async () => {
      for (const stderrIsTTY of [false, true]) {
        const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY, rushx });
        await handlers.onQueuePositionAsync(1, LOCKFILE, ANOTHER);
        advance(500);
        await handlers.onQueuePositionAsync(2, LOCKFILE, ANOTHER);
        await handlers.onQueuePositionAsync(2, LOCKFILE, ANOTHER);
        advance(1500);
        // Another cause of the same kind.
        await handlers.onQueuePositionAsync(2, PLUGIN_CODE, ANOTHER);
        advance(1000);
        await handlers.onQueuePositionAsync(2, REMOVED, ANOTHER);
        handlers.dispose();
        const another: string = 'for the daemon (PID 41) to restart for another request';
        const lockfile: string = 'because common/config/rush/pnpm-lock.yaml changed';
        expect(calls).toEqual([
          `stderr: ${client}: waiting ${another} (1 request ahead), ${lockfile}.\n`,
          ...(stderrIsTTY
            ? [`stderr: ${client}: waiting ${another} (2 requests ahead), ${lockfile}.\n`]
            : []),
          `stderr: ${client}: still waiting after 2s ${another} (2 requests ahead), because the code of Rush or a ` +
            'Rush plugin changed (common/autoinstallers/p/node_modules/q/lib/x.js).\n',
          `stderr: ${client}: still waiting after 3s ${another} (2 requests ahead), because the daemon's ` +
            'installation at /snapshots/s9 was removed.\n'
        ]);
      }
    });

    it('writes a line on a pipe when whose restart the request waits for changes, even for the same cause', async () => {
      const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY: false, rushx });
      await handlers.onQueuePositionAsync(1, LOCKFILE, {});
      await handlers.onQueuePositionAsync(1, LOCKFILE, ANOTHER);
      handlers.dispose();
      expect(calls).toEqual([
        `stderr: ${client}: waiting for 1 running request to finish; ${LOCKFILE_WAIT}.\n`,
        `stderr: ${client}: waiting for the daemon (PID 41) to restart for another request (1 request ahead), ` +
          'because common/config/rush/pnpm-lock.yaml changed.\n'
      ]);
    });

    it('stops when the request gets input, output or an event, or waits for plain admission', async () => {
      const stops: [string, (handlers: IDaemonRequestNoticeHandlers) => Promise<void> | void][] = [
        ['input', (handlers) => handlers.onInputAdmittedAsync()],
        ['progress', (handlers) => handlers.onRequestProgress()],
        ['plain position', (handlers) => handlers.onQueuePositionAsync(1)]
      ];
      for (const [, stop] of stops) {
        const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY: false, rushx });
        await handlers.onQueuePositionAsync(1, LOCKFILE, ANOTHER);
        await stop(handlers);
        advance(RESTART_WAIT_REPEAT_MS * 3);
        expect(calls).toHaveLength(1);
        // A later wait is a new one.
        await handlers.onQueuePositionAsync(1, LOCKFILE, ANOTHER);
        handlers.dispose();
        expect(calls).toHaveLength(2);
        expect(calls[1]).toBe(calls[0]);
      }
    });

    it('writes nothing more once the request ends or the client asks rushd to cancel it', async () => {
      for (const stderrIsTTY of [false, true]) {
        const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY, rushx });
        await handlers.onQueuePositionAsync(1, LOCKFILE, ANOTHER);
        handlers.dispose();
        advance(RESTART_WAIT_REPEAT_MS * 3);
        await handlers.onQueuePositionAsync(1, REMOVED, ANOTHER);
        await handlers.onQueuePositionAsync(2);
        expect(calls).toHaveLength(1);
      }
    });

    it('names the new daemon after a restart, and writes plain positions only to a terminal', async () => {
      for (const stderrIsTTY of [false, true]) {
        const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY, rushx });
        await handlers.onQueuePositionAsync(3);
        await handlers.onQueuePositionAsync(1, REMOVED, {});
        await handlers.onRestartAsync({ restart: 1, reason: REMOVED, successorPid: 42 });
        await handlers.onQueuePositionAsync(1, LOCKFILE, {});
        handlers.dispose();
        // The wait line said why the daemon restarted, so the restart gets no notice (task 222).
        expect(calls).toEqual([
          ...(stderrIsTTY ? [`stderr: ${client}: waiting for daemon admission (position 3).\n`] : []),
          `stderr: ${client}: waiting for 1 running request to finish; the daemon (PID 41) then restarts, because ` +
            'its installation at /snapshots/s9 was removed.\n',
          `stderr: ${client}: waiting for 1 running request to finish; the daemon (PID 42) then restarts, because ` +
            'common/config/rush/pnpm-lock.yaml changed.\n'
        ]);
      }
    });

    it('gives no restart notice when a wait line since the last restart gave its cause (task 222)', async () => {
      const cases: [DaemonRestartReason, IDaemonRestartWaitDetails, DaemonRestartReason][] = [
        [
          ENV_BOTH,
          { scriptCount: 1 },
          { kind: 'environmentChanged', variableNames: ['NODE_OPTIONS', 'RUSH_X'] }
        ],
        [REMOVED, {}, { kind: 'installationChanged', change: 'removed', folder: '/snapshots/s9' }],
        // The wait line names the variables of the request that the daemon restarts for, and so does the notice.
        [ENV_NODE_OPTIONS, ANOTHER, ENV_NODE_OPTIONS]
      ];
      for (const stderrIsTTY of [false, true]) {
        for (const [waitReason, details, reason] of cases) {
          const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY, rushx });
          await handlers.onQueuePositionAsync(1, waitReason, details);
          advance(RESTART_WAIT_REPEAT_MS);
          await handlers.onRestartAsync({ restart: 1, reason, successorPid: 42 });
          advance(RESTART_WAIT_REPEAT_MS * 2);
          handlers.dispose();
          expect(calls).toHaveLength(2);
          expect(calls[1]).toBe(calls[0].replace(': waiting for ', ': still waiting after 25s for '));
        }
      }
    });

    it('gives the restart notice when no wait line since the last restart gave its cause (task 222)', async () => {
      const notice = (cause: string, pid: number): string =>
        `stderr: ${client}: ${cause}; restarted the daemon (PID ${pid}).\n`;
      const cases: [string, (handlers: IDaemonRequestNoticeHandlers) => Promise<void>, string][] = [
        [
          'other variables',
          async (handlers) => {
            await handlers.onQueuePositionAsync(1, ENV_NODE_OPTIONS, {});
            await handlers.onRestartAsync({ restart: 1, reason: ENV_BOTH, successorPid: 42 });
          },
          notice("A command's environment differed from the daemon's in NODE_OPTIONS and RUSH_X", 42)
        ],
        [
          'another change',
          async (handlers) => {
            await handlers.onQueuePositionAsync(1, REMOVED, {});
            await handlers.onRestartAsync({ restart: 1, reason: REPLACED, successorPid: 42 });
          },
          notice("The daemon's installation at /snapshots/s9 was replaced", 42)
        ],
        [
          'another installation',
          async (handlers) => {
            await handlers.onQueuePositionAsync(1, REMOVED, {});
            await handlers.onRestartAsync({ restart: 1, reason: REMOVED_S10, successorPid: 42 });
          },
          notice("The daemon's installation at /snapshots/s10 was removed", 42)
        ],
        [
          'another kind',
          async (handlers) => {
            await handlers.onQueuePositionAsync(1, LOCKFILE, {});
            await handlers.onRestartAsync({ restart: 1, reason: ENV_NODE_OPTIONS, successorPid: 42 });
          },
          notice("A command's environment differed from the daemon's in NODE_OPTIONS", 42)
        ],
        [
          'a plain position',
          async (handlers) => {
            await handlers.onQueuePositionAsync(1);
            await handlers.onRestartAsync({ restart: 1, reason: REMOVED, successorPid: 42 });
          },
          notice("The daemon's installation at /snapshots/s9 was removed", 42)
        ],
        [
          'a second restart',
          async (handlers) => {
            await handlers.onQueuePositionAsync(1, REMOVED, {});
            await handlers.onRestartAsync({ restart: 1, reason: REMOVED, successorPid: 42 });
            await handlers.onRestartAsync({ restart: 2, reason: REMOVED, successorPid: 43 });
          },
          notice("The daemon's installation at /snapshots/s9 was removed", 43)
        ]
      ];
      for (const stderrIsTTY of [false, true]) {
        for (const [name, runAsync, expected] of cases) {
          const { calls, handlers } = createHandlers({ agent: false, stderrIsTTY, rushx });
          await runAsync(handlers);
          handlers.dispose();
          expect([name, calls.filter((call: string) => call.includes('restarted the daemon'))]).toEqual([
            name,
            [expected]
          ]);
          expect(calls[calls.length - 1]).toBe(expected);
        }
      }
    });
  });

  it('shows a restart wait as the agent phase, announces each cause, and names the new daemon after the restart', async () => {
    const { calls, handlers } = createHandlers({ agent: true, stderrIsTTY: false });
    await handlers.onQueuePositionAsync(2);
    await handlers.onQueuePositionAsync(2, LOCKFILE, { scriptCount: 1 });
    await handlers.onQueuePositionAsync(1, LOCKFILE, {});
    advance(RESTART_WAIT_REPEAT_MS * 2);
    await handlers.onQueuePositionAsync(1, REMOVED, {});
    await handlers.onRestartAsync({ restart: 1, reason: REMOVED, successorPid: 42 });
    await handlers.onQueuePositionAsync(1, REMOVED, {});
    handlers.dispose();
    const removed: string = 'because its installation at /snapshots/s9 was removed';
    // The renderer wrote the announced wait as a line, which said why the daemon restarted, so the restart gets no
    // note (task 222).
    expect(calls).toEqual([
      'position: 2',
      `announce: waiting for 2 running requests to finish, including 1 rushx script; ${LOCKFILE_WAIT}`,
      `wait: waiting for 1 running request to finish; ${LOCKFILE_WAIT}`,
      `announce: waiting for 1 running request to finish; the daemon (PID 41) then restarts, ${removed}`,
      `phase: ${RESUBMITTED_PHASE}`,
      `announce: waiting for 1 running request to finish; the daemon (PID 42) then restarts, ${removed}`
    ]);
  });

  it('gives the agent a note for the restart only when the renderer wrote no line for its wait (task 222)', async () => {
    const wait: string =
      "waiting for 1 running request to finish; the daemon (PID 41) then restarts, because this request's " +
      "environment differs from the daemon's in NODE_OPTIONS";
    for (const agentWritesWaitLines of [true, false]) {
      const { calls, handlers } = createHandlers({ agent: true, stderrIsTTY: false, agentWritesWaitLines });
      await handlers.onQueuePositionAsync(1, ENV_NODE_OPTIONS, {});
      await handlers.onQueuePositionAsync(1, ENV_NODE_OPTIONS, {});
      await handlers.onRestartAsync({ restart: 1, reason: ENV_NODE_OPTIONS, successorPid: 42 });
      handlers.dispose();
      // On a TTY, the wait was only in the live rows, which the renderer then redraws.
      expect(calls).toEqual([
        `announce: ${wait}`,
        `wait: ${wait}`,
        ...(agentWritesWaitLines
          ? []
          : [
              "note: rush-client: A command's environment differed from the daemon's in NODE_OPTIONS; restarted " +
                'the daemon (PID 42).'
            ]),
        `phase: ${RESUBMITTED_PHASE}`
      ]);
    }
  });

  it('keeps the agent phase after a restart that the request did not wait for', async () => {
    const { calls, handlers } = createHandlers({ agent: true, stderrIsTTY: false });
    await handlers.onQueuePositionAsync(1);
    await handlers.onRestartAsync({ restart: 1, reason: undefined, successorPid: 42 });
    expect(calls).toEqual(['position: 1']);
  });

  it('gives the agent renderer no more positions once the request ends or the client asks rushd to cancel it', async () => {
    const { calls, handlers } = createHandlers({ agent: true, stderrIsTTY: false });
    await handlers.onQueuePositionAsync(1, LOCKFILE, {});
    handlers.dispose();
    await handlers.onQueuePositionAsync(1, REMOVED, {});
    await handlers.onQueuePositionAsync(2);
    expect(calls).toEqual([`announce: waiting for 1 running request to finish; ${LOCKFILE_WAIT}`]);
  });
});
