// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DAEMON_PROTOCOL_VERSION,
  type DaemonEventType,
  type IDaemonEventEnvelope
} from '@rushstack/rush-daemon-protocol';

import { AgentProgressRenderer } from '../AgentProgressRenderer';

function event(type: DaemonEventType, payload: unknown): IDaemonEventEnvelope {
  return {
    eventId: 'event',
    sessionId: 'session',
    sequence: 1,
    timestamp: new Date().toISOString(),
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    source: { packageName: 'test', packageVersion: '1.0.0' },
    privacy: 'public',
    required: false,
    type,
    payload
  };
}

const ANSI_ESCAPE: RegExp = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');

interface ITestRenderer {
  renderer: AgentProgressRenderer;
  output: string[];
  clock: { ms: number };
  /** All output, split into lines. */
  lines(): string[];
}

function createRenderer(isTTY: boolean, commandName: string = 'build', columns: number = 60): ITestRenderer {
  const output: string[] = [];
  const clock: { ms: number } = { ms: 0 };
  const renderer: AgentProgressRenderer = new AgentProgressRenderer({
    commandName,
    isTTY,
    columns,
    write: (text: string) => output.push(text),
    now: () => clock.ms,
    startTimeMs: 0
  });
  return { renderer, output, clock, lines: () => output.join('').split('\n').slice(0, -1) };
}

function registered(operationId: string, silent: boolean = false): IDaemonEventEnvelope {
  return event('operationRegistered', { operationId, silent });
}

function status(
  operationId: string,
  value: string,
  logFilePath?: string,
  commandKind?: unknown
): IDaemonEventEnvelope {
  return event('operationStatusChanged', {
    operationId,
    previousStatus: 'READY',
    status: value,
    logFilePath,
    commandKind
  });
}

function header(
  operationId: string,
  completedOperations: number,
  totalOperations: number
): IDaemonEventEnvelope {
  return event('extension', {
    name: 'rushd.operation-header',
    data: { operationId, completedOperations, totalOperations }
  });
}

function streamClosed(operationId: string): IDaemonEventEnvelope {
  return event('extension', { name: 'rushd.operation-stream-closed', data: { operationId } });
}

function fail(renderer: AgentProgressRenderer, operationId: string, errorLines: ReadonlyArray<string>): void {
  renderer.onEvent(status(operationId, 'EXECUTING'));
  renderer.onLog(Buffer.from(errorLines.map((line) => `${line}\n`).join('')), operationId, 'stderr');
  renderer.onEvent(status(operationId, 'FAILURE', `/repo/${operationId.split(' ')[0]}/rush-logs/x.log`));
}

describe(AgentProgressRenderer.name, () => {
  it('writes one line when the request is sent and a summary line for a successful build (pipe)', () => {
    const { renderer, output, clock, lines } = createRenderer(false);
    renderer.start();
    expect(output).toEqual([]);
    renderer.onRequestSent();
    expect(output).toEqual([
      'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)\n'
    ]);
    renderer.onEvent(registered('a (build)'));
    renderer.onEvent(registered('b (build)'));
    renderer.onEvent(registered('hidden', true));
    renderer.onEvent(status('a (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('noise\n'), 'a (build)', 'stdout');
    clock.ms = 2500;
    renderer.onEvent(status('a (build)', 'SUCCESS'));
    renderer.onEvent(status('hidden', 'SUCCESS'));
    renderer.onEvent(status('b (build)', 'SKIPPED'));
    clock.ms = 3000;
    expect(renderer.finish({ exitCode: 0 })).toBe(false);
    renderer.dispose();
    expect(lines()).toEqual([
      'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)',
      'rush build: SUCCESS 2/2 operations (1 success, 1 up to date) in 3.0s'
    ]);
  });

  it('reports an up-to-date request instead of printing nothing', () => {
    const { renderer, output } = createRenderer(false);
    renderer.finish({ exitCode: 0 });
    expect(output).toEqual(['rush build: SUCCESS up to date (no operations needed) in 0.0s\n']);
  });

  it('tells an empty selection apart from a request whose operations were all up to date (#634)', () => {
    const hot: ITestRenderer = createRenderer(false);
    // The daemon announces retained operations as silent and reports their retained results.
    hot.renderer.onEvent(registered('a (build)', true));
    hot.renderer.onEvent(registered('b (build)', true));
    hot.renderer.finish({
      exitCode: 0,
      operationResults: [
        { operationId: 'a (build)', status: 'SUCCESS' },
        { operationId: 'b (build)', status: 'FROM CACHE' }
      ]
    });
    expect(hot.output).toEqual(['rush build: SUCCESS up to date (no operations needed) in 0.0s\n']);

    const empty: ITestRenderer = createRenderer(false);
    empty.renderer.finish({ exitCode: 0, operationResults: [] });
    expect(empty.output).toEqual([
      'rush build: SUCCESS 0 operations in 0.0s · the selection parameters did not match any projects\n'
    ]);
  });

  it('reports a failed operation with its log file and an excerpt as soon as it fails', () => {
    const { renderer, lines } = createRenderer(false);
    fail(
      renderer,
      'p05 (build)',
      Array.from({ length: 20 }, (unused, i) => `error ${i}`)
    );
    expect(lines()).toHaveLength(9);
    renderer.onEvent(status('p06 (build)', 'BLOCKED'));
    renderer.finish({ exitCode: 1 });
    expect(lines()).toEqual([
      'failed: p05 (build) · full log: /repo/p05/rush-logs/x.log',
      '  error 0',
      '  error 1',
      '  error 2',
      '  error 3',
      '  error 4',
      '  error 5',
      '  error 18',
      '  error 19',
      'rush build: FAILURE 2/2 operations (1 failure, 1 blocked) in 0.0s · failed: p05 (build)'
    ]);
  });

  it('says how many operations continue in rushd after a failure that the daemon reported early', () => {
    const operationIds: ReadonlyArray<string> = ['a (build)', 'b (build)', 'c (build)', 'd (build)'];
    const finishWith = (unfinished: ReadonlyArray<[string, string]>, exitCode: number = 1): string[] => {
      const { renderer, lines } = createRenderer(false);
      for (const operationId of operationIds) renderer.onEvent(registered(operationId));
      fail(renderer, 'b (build)', ['error']);
      renderer.onEvent(status('a (build)', 'BLOCKED'));
      renderer.finish({
        exitCode,
        operationResults: [
          { operationId: 'a (build)', status: 'BLOCKED' },
          { operationId: 'b (build)', status: 'FAILURE' },
          ...unfinished.map(([operationId, value]) => ({ operationId, status: value }))
        ]
      });
      return lines();
    };

    expect(finishWith([['c (build)', 'EXECUTING']]).pop()).toBe(
      'rush build: FAILURE 2/4 operations (1 failure, 1 blocked) in 0.0s · failed: b (build)' +
        ' · 1 independent operation continues in rushd'
    );
    expect(
      finishWith([
        ['c (build)', 'EXECUTING'],
        ['d (build)', 'QUEUED']
      ]).pop()
    ).toMatch(/ · failed: b \(build\) · 2 independent operations continue in rushd$/);
    expect(finishWith([['c (build)', 'SUCCESS']]).pop()).toMatch(/ · failed: b \(build\)$/);
    expect(finishWith([['c (build)', 'EXECUTING']], 0).pop()).not.toContain('continue');
  });

  it('keeps failure diagnostics when successful operations wrote stderr first', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onEvent(status('noisy (build)', 'EXECUTING'));
    for (let i: number = 0; i < 20; i++) {
      renderer.onLog(Buffer.from(`warning ${i}\n`), 'noisy (build)', 'stderr');
    }
    renderer.onEvent(status('noisy (build)', 'SUCCESS WITH WARNINGS'));
    fail(renderer, 'broken (build)', ['the real error']);
    renderer.finish({ exitCode: 1 });
    const text: string = output.join('');
    expect(text).toContain(
      'failed: broken (build) · full log: /repo/broken/rush-logs/x.log\n  the real error\n'
    );
    expect(text).not.toContain('warning 1');
    expect(text).toMatch(/· failed: broken \(build\)\n$/);
  });

  it('reports unchanged operations as up to date, whether the daemon says SKIPPED or NO OP', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onEvent(status('a (build)', 'NO OP'));
    renderer.onEvent(status('b (build)', 'SKIPPED'));
    renderer.onEvent(status('c (build)', 'FROM CACHE'));
    renderer.finish({ exitCode: 0 });
    expect(output[output.length - 1]).toBe(
      'rush build: SUCCESS 3/3 operations (1 from cache, 2 up to date) in 0.0s\n'
    );
  });

  it('counts ABORTED operations as finished', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onEvent(registered('a (build)'));
    renderer.onEvent(status('a (build)', 'EXECUTING'));
    renderer.onEvent(status('a (build)', 'ABORTED'));
    renderer.finish({ exitCode: 1 });
    expect(output[output.length - 1]).toBe('rush build: FAILURE 1/1 operations (1 aborted) in 0.0s\n');
  });

  it('reports a cancelled command as CANCELLED, without the output of the interrupted operations', () => {
    const { renderer, lines } = createRenderer(false);
    renderer.onEvent(registered('a (build)'));
    renderer.onEvent(registered('b (build)'));
    renderer.onEvent(status('a (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('error: interrupted by SIGINT\n'), 'a (build)', 'stderr');
    renderer.finish({
      exitCode: 130,
      cancelled: true,
      operationResults: [
        { operationId: 'a (build)', status: 'ABORTED' },
        { operationId: 'b (build)', status: 'ABORTED' }
      ]
    });
    expect(lines()).toEqual(['rush build: CANCELLED 2/2 operations (2 aborted) in 0.0s']);
  });

  it('still reports the failures of a cancelled command', () => {
    const { renderer, lines } = createRenderer(false);
    fail(renderer, 'a (build)', ['src/a.ts(1,1): error TS2322: bad']);
    renderer.finish({ exitCode: 130, cancelled: true });
    expect(lines().slice(-3)).toEqual([
      'failed: a (build) · full log: /repo/a/rush-logs/x.log',
      '  src/a.ts(1,1): error TS2322: bad',
      'rush build: CANCELLED 1/1 operations (1 failure) in 0.0s · failed: a (build)'
    ]);
  });

  it('says at once that it waits for rushd to stop a cancelled request, and whether rushd confirmed (task 132)', () => {
    const confirmed: ITestRenderer = createRenderer(false);
    confirmed.renderer.onEvent(registered('a (build)'));
    confirmed.renderer.onEvent(status('a (build)', 'EXECUTING'));
    confirmed.clock.ms = 7_600;
    confirmed.renderer.onCancelRequested(5_000);
    expect(confirmed.lines()).toEqual([
      'rush build 0/1 · 7.6s · cancelling; waiting up to 5s for rushd to stop the request'
    ]);
    // Written once, and the operations that rushd stops do not make the request look as if it runs on.
    confirmed.renderer.onCancelRequested(5_000);
    confirmed.renderer.onEvent(status('a (build)', 'ABORTED'));
    confirmed.clock.ms = 8_100;
    confirmed.renderer.finish({ exitCode: 130, cancelled: true });
    expect(confirmed.lines()).toEqual([
      'rush build 0/1 · 7.6s · cancelling; waiting up to 5s for rushd to stop the request',
      'rush build: CANCELLED 1/1 operations (1 aborted) in 8.1s'
    ]);

    const unconfirmed: ITestRenderer = createRenderer(false);
    unconfirmed.renderer.onCancelRequested(5_000);
    unconfirmed.clock.ms = 5_000;
    unconfirmed.renderer.finish({ exitCode: 130, cancelled: true, stopUnconfirmed: true });
    expect(unconfirmed.lines()).toEqual([
      'rush build · 0.0s · cancelling; waiting up to 5s for rushd to stop the request',
      'rush build: CANCELLED in 5.0s · rushd did not confirm that the request stopped; it may still be stopping'
    ]);
  });

  it('keeps showing on a TTY that it cancels', () => {
    jest.useFakeTimers();
    try {
      const { renderer, output } = createRenderer(true, 'build', 120);
      const firstRow = (): string => output[output.length - 1].replace(ANSI_ESCAPE, '').split('\n')[0];
      renderer.start();
      renderer.onEvent(registered('a (build)'));
      renderer.onEvent(status('a (build)', 'EXECUTING'));
      renderer.onCancelRequested(5_000);
      // Repainted at once, rather than on the next tick of the timer.
      expect(firstRow()).toBe(
        '⠙ rush build 0/1 · 0.0s · cancelling; waiting up to 5s for rushd to stop the request'
      );
      renderer.onEvent(status('a (build)', 'ABORTED'));
      renderer.onQueuePosition(1);
      jest.advanceTimersByTime(100);
      // Neither the operation that rushd stopped nor a queue position makes the request look as if it runs on.
      expect(firstRow()).toBe(
        '⠹ rush build 1/1 · 0.0s · cancelling; waiting up to 5s for rushd to stop the request'
      );
      renderer.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  it('applies final statuses from the daemon result that no event reported', () => {
    const { renderer, lines } = createRenderer(false);
    const reason: string =
      'The Rush daemon was shut down (idle timeout) while this request was running; re-run the command.';
    renderer.onEvent(registered('a (build)'));
    renderer.onEvent(registered('b (build)'));
    renderer.onEvent(registered('silent (build)', true));
    renderer.onEvent(status('a (build)', 'SUCCESS'));
    renderer.onEvent(status('b (build)', 'EXECUTING'));
    const reported: boolean = renderer.finish({
      exitCode: 1,
      errorMessage: reason,
      operationResults: [
        { operationId: 'a (build)', status: 'SUCCESS' },
        { operationId: 'b (build)', status: 'ABORTED' },
        { operationId: 'silent (build)', status: 'ABORTED' },
        // The result lists silent operations too; one that no event announced is not counted.
        { operationId: 'unannounced (build)', status: 'NO OP' }
      ]
    });
    expect(reported).toBe(true);
    expect(lines().slice(-1)).toEqual([
      `rush build: FAILURE 2/2 operations (1 aborted, 1 success) in 0.0s · ${reason}`
    ]);
  });

  it("prints a failed operation's error from the daemon result when the operation wrote no output", () => {
    const { renderer, lines } = createRenderer(false);
    renderer.onEvent(registered('a (build)'));
    renderer.onEvent(status('a (build)', 'EXECUTING'));
    renderer.finish({
      exitCode: 1,
      operationResults: [{ operationId: 'a (build)', status: 'FAILURE', errorMessage: 'spawn heft ENOENT' }]
    });
    expect(lines().slice(-3)).toEqual([
      'failed: a (build)',
      '  spawn heft ENOENT',
      'rush build: FAILURE 1/1 operations (1 failure) in 0.0s · failed: a (build)'
    ]);
  });

  it('tells a repeated finish whether its error message was already reported in full', () => {
    const { renderer, output } = createRenderer(false);
    const message: string = 'Daemon rejected the request (routingFailed): Another Rush command is running.';
    expect(renderer.finish({ exitCode: 1, errorMessage: message })).toBe(true);
    expect(renderer.finish({ exitCode: 1, errorMessage: message })).toBe(true);
    expect(renderer.finish({ exitCode: 1, errorMessage: 'another message' })).toBe(false);
    expect(output).toEqual([`rush build: FAILURE in 0.0s · ${message}\n`]);
  });

  it('keeps the legacy "daemon admission failed (<code>)" string in the summary line (#785)', () => {
    const timeout: ITestRenderer = createRenderer(false);
    const message: string =
      'The request was not admitted within 30000ms while waiting for workspace admission. ' +
      'Use --wait-timeout <seconds> or RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS to wait longer.';
    expect(
      timeout.renderer.finish({ exitCode: 1, admissionErrorCode: 'wait-timeout', errorMessage: message })
    ).toBe(true);
    expect(timeout.output).toEqual([
      `rush build: FAILURE in 0.0s · daemon admission failed (wait-timeout): ${message}\n`
    ]);

    const noWait: ITestRenderer = createRenderer(false);
    noWait.renderer.finish({
      exitCode: 1,
      admissionErrorCode: 'no-wait',
      errorMessage: 'The workspace is busy.'
    });
    expect(noWait.output).toEqual([
      'rush build: FAILURE in 0.0s · daemon admission failed (no-wait): The workspace is busy.\n'
    ]);

    // A request aborted while it waited, for example by a daemon shutdown, is not a busy workspace.
    const aborted: ITestRenderer = createRenderer(false);
    aborted.renderer.finish({
      exitCode: 1,
      admissionErrorCode: 'aborted',
      errorMessage: 'The Rush daemon was shut down.'
    });
    expect(aborted.output).toEqual(['rush build: FAILURE in 0.0s · The Rush daemon was shut down.\n']);
  });

  it('writes the reason for an admission failure in full however long it is, so the caller adds nothing', () => {
    // A restart drain that timed out behind a rushx script after it waived time: 350 characters.
    const message: string =
      'The request was not admitted before the daemon could restart for its environment, which waits for the ' +
      'requests that the daemon is serving to finish, including a rushx script that may not exit until it is ' +
      'stopped; 61.8s spent waiting for requests that were already running did not count. Stop the script, ' +
      'or use --wait-timeout <seconds> to wait longer.';
    expect(message.length).toBeGreaterThan(300);
    const { renderer, output } = createRenderer(false);
    expect(renderer.finish({ exitCode: 1, admissionErrorCode: 'wait-timeout', errorMessage: message })).toBe(
      true
    );
    expect(output).toEqual([
      `rush build: FAILURE in 0.0s · daemon admission failed (wait-timeout): ${message}\n`
    ]);
  });

  it('clips any other single-line error message that is too long, and leaves it to the caller', () => {
    const message: string = `Rush failed: ${'x'.repeat(400)} (end)`;
    const { renderer, output } = createRenderer(false);
    expect(renderer.finish({ exitCode: 1, errorMessage: message })).toBe(false);
    expect(output).toHaveLength(1);
    expect(output[0]).toMatch(/^rush build: FAILURE in 0\.0s · Rush failed: x+…x+ \(end\)\n$/);
    expect(output[0].length).toBeLessThan(message.length);
  });

  it('writes the final line at most once and nothing after it', () => {
    const { renderer, output } = createRenderer(false);
    expect(renderer.finish({ exitCode: 1, errorMessage: 'daemon rejected the request (x)' })).toBe(true);
    expect(renderer.finish({ exitCode: 1, errorMessage: 'again' })).toBe(false);
    renderer.onQueuePosition(3);
    renderer.onEvent(status('a (build)', 'FAILURE'));
    renderer.dispose();
    expect(output).toEqual(['rush build: FAILURE in 0.0s · daemon rejected the request (x)\n']);
  });

  it('writes the further lines of a multi-line error message before the summary line', () => {
    const { renderer, output } = createRenderer(false);
    expect(renderer.finish({ exitCode: 1, errorMessage: 'first line\n\nsecond line\n' })).toBe(true);
    expect(output).toEqual(['  second line\nrush build: FAILURE in 0.0s · first line\n']);
  });

  it('keeps the age of a daemon that did not answer, and that Rush was not run in-process, whole', () => {
    // As the client words it for a stopped daemon, with a socket path as long as a Unix socket path can be.
    const socketPath: string = `/${'s'.repeat(100)}.sock`;
    const description: string =
      `The daemon, rushd (PID 4194304), did not answer at ${socketPath}: it is stopped (state T), ` +
      'for example by SIGSTOP, and it started 59 min ago.';
    const notRun: string =
      'Rush was not run in-process, where it would compete with that daemon for the repository.';
    const hint: string = 'Resume it with "kill -CONT 4194304"; it then serves the next command.';
    const { renderer, output } = createRenderer(false);
    expect(renderer.finish({ exitCode: 1, errorMessage: [description, notRun, hint].join('\n') })).toBe(true);
    expect(output.join('').split('\n')).toEqual([
      `  ${notRun}`,
      `  ${hint}`,
      `rush build: FAILURE in 0.0s · ${description}`,
      ''
    ]);
  });

  it('elides the middle of an error message with thousands of lines and keeps its last lines', () => {
    const { renderer, output } = createRenderer(false);
    const diagnostics: string[] = Array.from({ length: 1745 }, (unused, index) => `debug line ${index}`);
    const message: string = [
      'Daemon rejected the request (invalidRequest): Incremental strategy: cache restoration',
      ...diagnostics,
      'The project name "@x/nope" passed to "--to" does not exist in rush.json.',
      'An error occurred.'
    ].join('\n');
    expect(renderer.finish({ exitCode: 1, errorMessage: message })).toBe(true);
    expect(output.join('').split('\n')).toEqual([
      '  debug line 0',
      '  debug line 1',
      '  … 1740 more lines …',
      '  debug line 1742',
      '  debug line 1743',
      '  debug line 1744',
      '  The project name "@x/nope" passed to "--to" does not exist in rush.json.',
      '  An error occurred.',
      'rush build: FAILURE in 0.0s · Daemon rejected the request (invalidRequest): Incremental strategy: cache restoration',
      ''
    ]);
  });

  it('reports the queue in the summary line rather than in a line of its own (pipe)', () => {
    const { renderer, output, clock } = createRenderer(false);
    clock.ms = 100;
    renderer.onQueuePosition(2);
    clock.ms = 5000;
    renderer.onQueuePosition(1);
    expect(output).toEqual([]);
    clock.ms = 15_000;
    renderer.onEvent(status('a (build)', 'EXECUTING'));
    renderer.onEvent(status('a (build)', 'SUCCESS'));
    renderer.finish({ exitCode: 0 });
    expect(output).toEqual([
      'rush build: SUCCESS 1/1 operations (1 success) in 15.0s · ' +
        'queued behind another request (position 2 at 0.1s)\n'
    ]);
  });

  it('leaves the queue to the message of a request that was not admitted', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onQueuePosition(1);
    renderer.finish({ exitCode: 1, admissionErrorCode: 'no-wait', errorMessage: 'The workspace is busy.' });
    expect(output).toEqual([
      'rush build: FAILURE in 0.0s · daemon admission failed (no-wait): The workspace is busy.\n'
    ]);
  });

  it('gives no old queue position as the reason for a failure, but keeps it for a cancellation (task 189)', () => {
    const failed: ITestRenderer = createRenderer(false, 'install');
    failed.clock.ms = 200;
    failed.renderer.onQueuePosition(1);
    failed.clock.ms = 21_600;
    failed.renderer.finish({ exitCode: 1 });
    expect(failed.lines()).toEqual(['rush install: FAILURE in 21.6s']);

    const withMessage: ITestRenderer = createRenderer(false, 'install');
    withMessage.renderer.onQueuePosition(1);
    withMessage.renderer.finish({ exitCode: 1, errorMessage: 'The mutation failed.' });
    expect(withMessage.lines()).toEqual(['rush install: FAILURE in 0.0s · The mutation failed.']);

    const cancelled: ITestRenderer = createRenderer(false);
    cancelled.clock.ms = 200;
    cancelled.renderer.onQueuePosition(1);
    cancelled.clock.ms = 3_000;
    cancelled.renderer.finish({ exitCode: 130, cancelled: true });
    expect(cancelled.lines()).toEqual([
      'rush build: CANCELLED in 3.0s · queued behind another request (position 1 at 0.2s)'
    ]);
  });

  it('shows the excerpt of a failed operation that reported errors on stdout', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onEvent(status('ok (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('ok noise\n'), 'ok (build)', 'stdout');
    renderer.onEvent(status('ok (build)', 'SUCCESS'));
    renderer.onEvent(status('tsc (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('src/x.ts(1,1): error TS1005: stdout-error\n'), 'tsc (build)', 'stdout');
    renderer.onEvent(status('tsc (build)', 'FAILURE'));
    renderer.finish({ exitCode: 1 });
    const text: string = output.join('');
    expect(text).toContain('failed: tsc (build)\n  src/x.ts(1,1): error TS1005: stdout-error\n');
    expect(text).not.toContain('ok noise');
  });

  it('says so when a failed operation wrote no output', () => {
    const { renderer, lines } = createRenderer(false);
    renderer.onEvent(status('quiet (build)', 'FAILURE'));
    renderer.finish({ exitCode: 1 });
    expect(lines().slice(-3)).toEqual([
      'failed: quiet (build)',
      '  (no output)',
      'rush build: FAILURE 1/1 operations (1 failure) in 0.0s · failed: quiet (build)'
    ]);
  });

  it('shows the queue position immediately on a TTY', () => {
    const { renderer, output } = createRenderer(true, 'build', 120);
    renderer.onQueuePosition(2);
    expect(output[0]).toContain('queued behind another request (position 2)');
    renderer.dispose();
  });

  it('writes a final summary line after a queued request completes', () => {
    const { renderer, output, clock } = createRenderer(false);
    renderer.start();
    renderer.onQueuePosition(1);
    clock.ms = 4000;
    renderer.finish({ exitCode: 0 });
    expect(output[output.length - 1]).toBe(
      'rush build: SUCCESS up to date (no operations needed) in 4.0s · ' +
        'queued behind another request (position 1 at 0.0s)\n'
    );
  });

  it('writes one progress line and one summary line on a pipe at odsp-web scale', () => {
    const { renderer, clock, lines } = createRenderer(false);
    renderer.start();
    renderer.onRequestSent();
    renderer.onQueuePosition(1);
    const operationIds: string[] = Array.from({ length: 772 }, (unused, i) => `p${i} (build)`);
    for (const operationId of operationIds) {
      renderer.onEvent(registered(operationId));
    }
    for (let i: number = 0; i < 1200; i++) {
      renderer.onEvent(registered(`p${i} (tool-build)`, true));
    }
    for (const [index, operationId] of operationIds.entries()) {
      clock.ms = index * 270;
      renderer.onEvent(status(operationId, 'EXECUTING'));
      renderer.onLog(Buffer.from(`building ${operationId}\n`), operationId, 'stdout');
      renderer.onEvent(status(operationId, index % 2 ? 'FROM CACHE' : 'SUCCESS'));
      renderer.onEvent(header(operationId, index + 1, 772));
      renderer.onEvent(event('activityChanged', { text: `${index + 1} of 772 operations complete` }));
    }
    for (let i: number = 0; i < 1200; i++) {
      renderer.onEvent(status(`p${i} (tool-build)`, 'NO OP'));
    }
    clock.ms = 210_000;
    renderer.finish({ exitCode: 0 });
    expect(lines()).toEqual([
      'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)',
      'rush build: SUCCESS 772/772 operations (386 success, 386 from cache) in 210.0s · ' +
        'queued behind another request (position 1 at 0.0s)'
    ]);
  });

  it('keeps a failure at odsp-web scale to the sent line, the failure report and one summary line', () => {
    const { renderer, lines } = createRenderer(false);
    renderer.start();
    renderer.onRequestSent();
    for (let i: number = 0; i < 772; i++) {
      renderer.onEvent(registered(`p${i} (build)`));
    }
    for (let i: number = 0; i < 700; i++) {
      renderer.onEvent(status(`p${i} (build)`, 'EXECUTING'));
      renderer.onLog(Buffer.from(`${'noise '.repeat(20)}\n`.repeat(50)), `p${i} (build)`, 'stdout');
      renderer.onEvent(status(`p${i} (build)`, 'SUCCESS'));
    }
    fail(renderer, 'p700 (build)', [
      'src/x.ts:1:1 - error TS2304: Cannot find name "y".',
      'Encountered 1 error'
    ]);
    for (let i: number = 701; i < 772; i++) {
      renderer.onEvent(status(`p${i} (build)`, 'BLOCKED'));
    }
    renderer.finish({ exitCode: 1 });
    expect(lines()).toEqual([
      'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)',
      'failed: p700 (build) · full log: /repo/p700/rush-logs/x.log',
      '  src/x.ts:1:1 - error TS2304: Cannot find name "y".',
      'rush build: FAILURE 772/772 operations (1 failure, 71 blocked, 700 success) in 0.0s · failed: p700 (build)'
    ]);
  });

  it('ignores silent operations in the counters unless they fail', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onEvent(registered('a (build)'));
    renderer.onEvent(registered('s1 (tool-build)', true));
    renderer.onEvent(registered('s2 (tool-build)', true));
    renderer.onLog(Buffer.from('silent output\n'), 's1 (tool-build)', 'stderr');
    renderer.onEvent(status('s1 (tool-build)', 'NO OP'));
    renderer.onEvent(status('s2 (tool-build)', 'FAILURE'));
    renderer.onEvent(status('a (build)', 'SUCCESS'));
    renderer.finish({ exitCode: 1 });
    const text: string = output.join('');
    expect(text).not.toContain('silent output');
    expect(output[output.length - 1]).toMatch(
      /rush build: FAILURE 2\/2 operations \(1 failure, 1 success\) in 0\.0s · failed: s2 \(tool-build\)\n$/
    );
  });

  it('uses the per-request total from the operation header', () => {
    const { renderer, lines } = createRenderer(false);
    renderer.onEvent(header('a (build)', 1, 772));
    renderer.onEvent(status('a (build)', 'SUCCESS'));
    renderer.finish({ exitCode: 0 });
    expect(lines()).toEqual(['rush build: SUCCESS 1/772 operations (1 success) in 0.0s']);
  });

  it('counts an operation that runs again once', () => {
    const { renderer, output } = createRenderer(false);
    renderer.onEvent(registered('a (build)'));
    renderer.onEvent(status('a (build)', 'FAILURE'));
    renderer.onEvent(status('a (build)', 'READY'));
    renderer.onEvent(status('a (build)', 'EXECUTING'));
    renderer.onEvent(status('a (build)', 'SUCCESS'));
    renderer.finish({ exitCode: 0 });
    expect(output[output.length - 1]).toBe('rush build: SUCCESS 1/1 operations (1 success) in 0.0s\n');
  });

  it('reports operations with warnings when the warnings failed the request', () => {
    const { renderer, lines } = createRenderer(false);
    renderer.onEvent(status('w (build)', 'EXECUTING'));
    renderer.onLog(
      Buffer.from('[build:lint] Warning: src/x.ts:1:1 - (rule) message\n'),
      'w (build)',
      'stderr'
    );
    renderer.onEvent(status('w (build)', 'SUCCESS WITH WARNINGS', '/repo/w/rush-logs/w._phase_build.log'));
    renderer.finish({ exitCode: 1 });
    expect(lines().slice(-3)).toEqual([
      'warnings: w (build) · full log: /repo/w/rush-logs/w._phase_build.log',
      '  [build:lint] Warning: src/x.ts:1:1 - (rule) message',
      'rush build: FAILURE 1/1 operations (1 success with warnings) in 0.0s · warnings: w (build)'
    ]);
  });

  it('reports the output that explains warnings given after an operation succeeded, such as a failed cache write', () => {
    const { renderer, lines } = createRenderer(false);
    const tarLine: string =
      '"tar" exited with code 2 while attempting to create the cache entry. ' +
      'See "/repo/a/.rush/temp/a.tar.log" for logs from the tar process.';
    for (const operationId of ['a (build)', 'b (build)']) {
      renderer.onEvent(status(operationId, 'EXECUTING'));
      renderer.onLog(Buffer.from(`built ${operationId}\n`), operationId, 'stdout');
      renderer.onLog(Buffer.from(`note from ${operationId}\n`), operationId, 'stderr');
      renderer.onEvent(status(operationId, 'SUCCESS'));
    }
    // Rush writes an operation's build cache entry after its status. If that fails, it writes why and then changes
    // the status. The operation's output stream closes last.
    renderer.onLog(Buffer.from(`${tarLine}\nUnable to set `), 'a (build)', 'stderr');
    renderer.onLog(Buffer.from('local cache entry.\n'), 'a (build)', 'stderr');
    renderer.onEvent(event('extension', { name: 'rushd.unknown', data: { operationId: 'a (build)' } }));
    renderer.onEvent(status('a (build)', 'SUCCESS WITH WARNINGS', '/repo/a/rush-logs/a._phase_build.log'));
    renderer.onEvent(streamClosed('a (build)'));
    renderer.onLog(Buffer.from('Successfully set cache entry.\n'), 'b (build)', 'stdout');
    renderer.onEvent(streamClosed('b (build)'));
    renderer.finish({ exitCode: 1 });
    expect(lines()).toEqual([
      'warnings: a (build) · full log: /repo/a/rush-logs/a._phase_build.log',
      `  ${tarLine}`,
      '  Unable to set local cache entry.',
      'rush build: FAILURE 2/2 operations (1 success with warnings, 1 success) in 0.0s · warnings: a (build)'
    ]);
  });

  it('reports the output that an operation wrote after it succeeded when it then failed', () => {
    const { renderer, lines } = createRenderer(false);
    renderer.onEvent(status('a (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('compiled\n'), 'a (build)', 'stdout');
    renderer.onEvent(status('a (build)', 'SUCCESS'));
    renderer.onLog(Buffer.from('Unable to set local cache entry.\n'), 'a (build)', 'stderr');
    renderer.onEvent(status('a (build)', 'SUCCESS WITH WARNINGS'));
    // A later hook threw.
    renderer.onEvent(status('a (build)', 'FAILURE', '/repo/a/rush-logs/a._phase_build.log'));
    renderer.onEvent(streamClosed('a (build)'));
    renderer.finish({
      exitCode: 1,
      operationResults: [{ operationId: 'a (build)', status: 'FAILURE', errorMessage: 'the plugin failed' }]
    });
    expect(lines()).toEqual([
      'failed: a (build) · full log: /repo/a/rush-logs/a._phase_build.log',
      '  Unable to set local cache entry.',
      'error: a (build)',
      '  the plugin failed',
      'rush build: FAILURE 1/1 operations (1 failure) in 0.0s · failed: a (build)'
    ]);
  });

  it('discards the output that an operation wrote after it succeeded once its output stream closes', () => {
    const { renderer, lines } = createRenderer(false);
    renderer.onEvent(status('a (build)', 'EXECUTING'));
    renderer.onEvent(status('a (build)', 'SUCCESS'));
    renderer.onLog(Buffer.from('written after the first run\n'), 'a (build)', 'stderr');
    renderer.onEvent(streamClosed('a (build)'));
    // The operation runs again.
    renderer.onEvent(status('a (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('Warning: from the second run\n'), 'a (build)', 'stderr');
    renderer.onEvent(status('a (build)', 'SUCCESS WITH WARNINGS', '/repo/a/rush-logs/a._phase_build.log'));
    renderer.onEvent(streamClosed('a (build)'));
    renderer.finish({ exitCode: 1 });
    expect(lines()).toEqual([
      'warnings: a (build) · full log: /repo/a/rush-logs/a._phase_build.log',
      '  Warning: from the second run',
      'rush build: FAILURE 1/1 operations (1 success with warnings) in 0.0s · warnings: a (build)'
    ]);
  });

  it('does not report warnings when the request succeeded', () => {
    const { renderer, lines } = createRenderer(false);
    renderer.onEvent(status('w (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('Warning: x\n'), 'w (build)', 'stderr');
    renderer.onEvent(status('w (build)', 'SUCCESS WITH WARNINGS'));
    renderer.finish({ exitCode: 0 });
    expect(lines().slice(-1)).toEqual([
      'rush build: SUCCESS 1/1 operations (1 success with warnings) in 0.0s'
    ]);
    expect(lines().join('\n')).not.toContain('Warning: x');
  });

  it('says when a failed operation ran its incremental command, and that its next run uses the initial one', () => {
    const { renderer, lines } = createRenderer(false);
    for (const [name, commandKind] of [
      ['inc', 'incremental'],
      ['init', 'initial']
    ]) {
      renderer.onEvent(status(`${name} (build)`, 'EXECUTING'));
      renderer.onLog(Buffer.from(`${name} error\n`), `${name} (build)`, 'stderr');
      renderer.onEvent(status(`${name} (build)`, 'FAILURE', `/repo/${name}/rush-logs/x.log`, commandKind));
    }
    renderer.finish({ exitCode: 1 });
    expect(lines()).toEqual([
      'failed: inc (build) · incremental command; its next run uses the initial command · ' +
        'full log: /repo/inc/rush-logs/x.log',
      '  inc error',
      'failed: init (build) · full log: /repo/init/rush-logs/x.log',
      '  init error',
      'rush build: FAILURE 2/2 operations (2 failures) in 0.0s · failed: inc (build), init (build)'
    ]);
  });

  it('says when warnings that failed the request came from an incremental command', () => {
    const { renderer, lines } = createRenderer(false);
    renderer.onEvent(status('w (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('Warning: x\n'), 'w (build)', 'stderr');
    renderer.onEvent(status('w (build)', 'SUCCESS WITH WARNINGS', '/repo/w/rush-logs/x.log', 'incremental'));
    renderer.finish({ exitCode: 1 });
    expect(lines().slice(-3)).toEqual([
      'warnings: w (build) · incremental command · full log: /repo/w/rush-logs/x.log',
      '  Warning: x',
      'rush build: FAILURE 1/1 operations (1 success with warnings) in 0.0s · warnings: w (build)'
    ]);
  });

  it('names the command of the last run of an operation, and ignores a command it does not know', () => {
    const { renderer, lines } = createRenderer(false);
    // Operations without output are reported with the summary, after their last run.
    renderer.onEvent(status('again (build)', 'FAILURE', undefined, 'incremental'));
    renderer.onEvent(status('again (build)', 'READY'));
    renderer.onEvent(status('again (build)', 'EXECUTING'));
    renderer.onEvent(status('again (build)', 'FAILURE'));
    renderer.onEvent(status('odd (build)', 'FAILURE', undefined, 'other'));
    renderer.onEvent(status('late (build)', 'FAILURE', undefined, 'initial'));
    renderer.onEvent(status('late (build)', 'READY'));
    renderer.onEvent(status('late (build)', 'FAILURE', undefined, 'incremental'));
    renderer.finish({ exitCode: 1 });
    expect(lines().filter((line) => line.startsWith('failed: '))).toEqual([
      'failed: again (build)',
      'failed: odd (build)',
      'failed: late (build) · incremental command; its next run uses the initial command'
    ]);
  });

  it('caps the reported operations, their excerpts and the names in the summary', () => {
    const { renderer, lines } = createRenderer(false);
    for (let i: number = 0; i < 8; i++) {
      fail(
        renderer,
        `f${i} (build)`,
        Array.from({ length: 12 }, (unused, j) => `f${i} error ${j}`)
      );
    }
    renderer.finish({ exitCode: 1 });
    const report: string[] = lines();
    expect(report.filter((line) => line.startsWith('failed: '))).toEqual([
      'failed: f0 (build) · full log: /repo/f0/rush-logs/x.log',
      'failed: f1 (build) · full log: /repo/f1/rush-logs/x.log',
      'failed: f2 (build) · full log: /repo/f2/rush-logs/x.log'
    ]);
    expect(report.filter((line) => line.startsWith('  f0 '))).toHaveLength(8);
    expect(report.filter((line) => line.startsWith('  f1 '))).toHaveLength(3);
    expect(report.filter((line) => line.startsWith('  f2 '))).toHaveLength(3);
    expect(report.slice(-2)).toEqual([
      "+5 more failed operations; their logs are in each project's rush-logs folder",
      'rush build: FAILURE 8/8 operations (8 failures) in 0.0s · failed: f0 (build), f1 (build), f2 (build), ' +
        'f3 (build), f4 (build) +3 more'
    ]);
  });

  it('reports a failed operation that wrote no output with the error from the daemon result', () => {
    const { renderer, lines } = createRenderer(false);
    fail(renderer, 'a (build)', ['src/a.ts:1:1 - error TS2322: a']);
    renderer.onEvent(status('quiet (build)', 'FAILURE'));
    fail(renderer, 'b (build)', ['src/b.ts:1:1 - error TS2322: b']);
    expect(lines()).toHaveLength(4);
    renderer.finish({
      exitCode: 1,
      operationResults: [
        { operationId: 'a (build)', status: 'FAILURE' },
        { operationId: 'quiet (build)', status: 'FAILURE', errorMessage: 'spawn heft ENOENT' },
        { operationId: 'b (build)', status: 'FAILURE' }
      ]
    });
    expect(lines()).toEqual([
      'failed: a (build) · full log: /repo/a/rush-logs/x.log',
      '  src/a.ts:1:1 - error TS2322: a',
      'failed: b (build) · full log: /repo/b/rush-logs/x.log',
      '  src/b.ts:1:1 - error TS2322: b',
      'failed: quiet (build)',
      '  spawn heft ENOENT',
      'rush build: FAILURE 3/3 operations (3 failures) in 0.0s · failed: a (build), quiet (build), b (build)'
    ]);
  });

  it('prints the error of an operation reported as it failed, when its output lacks the error (task 142)', () => {
    const { renderer, lines } = createRenderer(false);
    const querying: string =
      'This project was not found in the local build cache. Querying the cloud build cache.';
    const sasError: string =
      "An Azure Storage SAS credential hasn't been provided, or has expired. Update the credentials by " +
      'running "rush update-cloud-credentials", or provide a SAS in the RUSH_BUILD_CACHE_CREDENTIAL ' +
      'environment variable';
    renderer.onEvent(registered('mini-a (build)'));
    renderer.onEvent(registered('mini-b (build)'));
    renderer.onEvent(status('mini-a (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from(`${querying}\n`), 'mini-a (build)', 'stdout');
    renderer.onEvent(status('mini-a (build)', 'FAILURE'));
    renderer.onEvent(status('mini-b (build)', 'BLOCKED'));
    expect(lines()).toEqual(['failed: mini-a (build)', `  ${querying}`]);
    renderer.finish({
      exitCode: 1,
      operationResults: [
        { operationId: 'mini-a (build)', status: 'FAILURE', errorMessage: `${sasError}\n` },
        { operationId: 'mini-b (build)', status: 'BLOCKED' }
      ]
    });
    expect(lines()).toEqual([
      'failed: mini-a (build)',
      `  ${querying}`,
      'error: mini-a (build)',
      `  ${sasError}`,
      'rush build: FAILURE 2/2 operations (1 failure, 1 blocked) in 0.0s · failed: mini-a (build)'
    ]);
  });

  it("prints a failed operation's error after its excerpt, with the further lines of a multi-line error", () => {
    const { renderer, lines } = createRenderer(false);
    renderer.onEvent(registered('a (build)'));
    renderer.onEvent(status('a (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('Restoring from the build cache\n'), 'a (build)', 'stdout');
    const detail: string[] = Array.from({ length: 9 }, (unused, i) => `  detail ${i}`);
    renderer.finish({
      exitCode: 1,
      operationResults: [
        {
          operationId: 'a (build)',
          status: 'FAILURE',
          errorMessage: ['  Could not read the cache entry', ...detail].join('\r\n')
        }
      ]
    });
    expect(lines()).toEqual([
      'failed: a (build)',
      '  Restoring from the build cache',
      '  Could not read the cache entry',
      '    detail 0',
      '    detail 1',
      '  … 2 more lines …',
      '    detail 4',
      '    detail 5',
      '    detail 6',
      '    detail 7',
      '    detail 8',
      'rush build: FAILURE 1/1 operations (1 failure) in 0.0s · failed: a (build)'
    ]);
  });

  it("does not repeat a failed operation's error that its output shows, or the exit code of a process that wrote output", () => {
    const { renderer, lines } = createRenderer(false);
    const readiness: string = 'The explicit daemon Node tool exited without completing IPC readiness.';
    fail(renderer, 'a (build)', ['src/a.ts:1:1 - error TS2322: a']);
    fail(renderer, 'b (build)', [
      `  The  explicit daemon node tool exited without completing IPC readiness.`
    ]);
    renderer.onEvent(status('c (build)', 'EXECUTING'));
    renderer.onLog(Buffer.from('c output\n'), 'c (build)', 'stderr');
    renderer.finish({
      exitCode: 1,
      operationResults: [
        { operationId: 'a (build)', status: 'FAILURE', errorMessage: 'Returned error code: 2' },
        { operationId: 'b (build)', status: 'FAILURE', errorMessage: readiness },
        { operationId: 'c (build)', status: 'FAILURE', errorMessage: 'Returned error code: 127' }
      ]
    });
    expect(lines()).toEqual([
      'failed: a (build) · full log: /repo/a/rush-logs/x.log',
      '  src/a.ts:1:1 - error TS2322: a',
      'failed: b (build) · full log: /repo/b/rush-logs/x.log',
      '  The  explicit daemon node tool exited without completing IPC readiness.',
      'failed: c (build)',
      '  c output',
      'rush build: FAILURE 3/3 operations (3 failures) in 0.0s · failed: a (build), b (build), c (build)'
    ]);
  });

  it('prints the signal that ended an operation, and clips a long error unless the output shows its start', () => {
    const { renderer, lines } = createRenderer(false);
    const long: string = `Cache entry rejected: ${'x'.repeat(400)}`;
    const other: string = `Cache entry rejected: ${'y'.repeat(400)}`;
    fail(renderer, 'a (build)', ['a output']);
    fail(renderer, 'b (build)', [long]);
    fail(renderer, 'c (build)', ['c output']);
    renderer.finish({
      exitCode: 1,
      operationResults: [
        { operationId: 'a (build)', status: 'FAILURE', errorMessage: 'Terminated by signal: SIGKILL' },
        { operationId: 'b (build)', status: 'FAILURE', errorMessage: long },
        { operationId: 'c (build)', status: 'FAILURE', errorMessage: other }
      ]
    });
    expect(lines()).toHaveLength(11);
    expect(lines()[3]).toMatch(/^ {2}Cache entry rejected: x+…x+$/);
    expect(lines().slice(6, 9)).toEqual([
      'error: a (build)',
      '  Terminated by signal: SIGKILL',
      'error: c (build)'
    ]);
    expect(lines()[9]).toMatch(/^ {2}Cache entry rejected: y+…y+$/);
    expect(lines()[9]).toHaveLength(2 + 300);
    expect(lines()[10]).toBe(
      'rush build: FAILURE 3/3 operations (3 failures) in 0.0s · failed: a (build), b (build), c (build)'
    );
  });

  it('reports at most three operations in all, as they failed or before the summary line', () => {
    const { renderer, lines } = createRenderer(false);
    fail(renderer, 'a (build)', ['a error']);
    for (const name of ['q1', 'q2', 'q3']) {
      renderer.onEvent(status(`${name} (build)`, 'FAILURE'));
    }
    fail(renderer, 'b (build)', ['b error']);
    renderer.finish({ exitCode: 1 });
    expect(lines()).toEqual([
      'failed: a (build) · full log: /repo/a/rush-logs/x.log',
      '  a error',
      'failed: b (build) · full log: /repo/b/rush-logs/x.log',
      '  b error',
      'failed: q1 (build)',
      '  (no output)',
      "+2 more failed operations; their logs are in each project's rush-logs folder",
      'rush build: FAILURE 5/5 operations (5 failures) in 0.0s · ' +
        'failed: a (build), q1 (build), q2 (build), q3 (build), b (build)'
    ]);
  });

  it('writes a failure report above the live rows on a TTY when the operation fails', () => {
    const { renderer, output } = createRenderer(true);
    renderer.start();
    fail(renderer, 'a (build)', ['src/a.ts:1:1 - error TS2322: a']);
    renderer.dispose();
    expect(output[1]).toBe('\x1b[3A\x1b[0J\x1b[?25h');
    expect(output[2]).toBe(
      'failed: a (build) · full log: /repo/a/rush-logs/x.log\n  src/a.ts:1:1 - error TS2322: a\n'
    );
    expect(output[3].replace(ANSI_ESCAPE, '').split('\n')[2]).toBe('failed: a (build)');
    expect(output.slice(4)).toEqual(['\x1b[3A\x1b[0J\x1b[?25h']);
  });

  it('shows the output of a command that failed without running operations', () => {
    const { renderer, lines } = createRenderer(false, 'install');
    renderer.onLog(Buffer.from('Installing packages\n'), 'request-id', 'stdout');
    renderer.onLog(
      Buffer.from('ERR_PNPM_FETCH_401 GET https://registry.example/pkg: Unauthorized\n'),
      'request-id',
      'stderr'
    );
    renderer.finish({ exitCode: 1 });
    expect(lines()).toEqual([
      '  ERR_PNPM_FETCH_401 GET https://registry.example/pkg: Unauthorized',
      'rush install: FAILURE in 0.0s'
    ]);
  });

  it('does not claim a successful global command was up to date', () => {
    const { renderer, output } = createRenderer(false, 'install');
    renderer.onLog(Buffer.from('Installing packages\n'), 'request-id', 'stdout');
    renderer.finish({ exitCode: 0 });
    expect(output).toEqual(['rush install: SUCCESS in 0.0s\n']);
  });

  describe('on a pipe, with timers', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function advance(clock: { ms: number }, ms: number): void {
      clock.ms += ms;
      jest.advanceTimersByTime(ms);
    }

    it('writes the connecting line only when the connection takes more than 10 s', () => {
      const fast: ITestRenderer = createRenderer(false);
      fast.renderer.start();
      advance(fast.clock, 3000);
      fast.renderer.onRequestSent();
      advance(fast.clock, 10_000);
      fast.renderer.dispose();
      expect(fast.lines()).toEqual([
        'rush build · 3.0s · sent to rushd; preparing the workspace graph (status at least every 25s)'
      ]);

      const { renderer, output, clock, lines } = createRenderer(false);
      renderer.start();
      advance(clock, 9999);
      expect(output).toEqual([]);
      advance(clock, 1);
      renderer.onRequestSent();
      renderer.dispose();
      expect(lines()).toEqual([
        'rush build · 10.0s · connecting to rushd (auto-starts if needed)',
        'rush build · 10.0s · sent to rushd; preparing the workspace graph (status at least every 25s)'
      ]);
    });

    it('starts once, and not after it stopped (task 60)', () => {
      const { renderer, clock, lines } = createRenderer(false);
      renderer.start();
      advance(clock, 5_000);
      // The client starts it again once routing chose the daemon.
      renderer.start();
      advance(clock, 5_000);
      advance(clock, 10_000);
      expect(lines()).toEqual(['rush build · 10.0s · connecting to rushd (auto-starts if needed)']);
      renderer.dispose();

      for (const isTTY of [false, true]) {
        const stopped: ITestRenderer = createRenderer(isTTY);
        stopped.renderer.dispose();
        stopped.renderer.start();
        // A timer would keep the client alive after rendering stopped.
        expect(jest.getTimerCount()).toBe(0);
        advance(stopped.clock, 30_000);
        expect(stopped.output).toEqual([]);
      }

      const tty: ITestRenderer = createRenderer(true);
      tty.renderer.start();
      const painted: number = tty.output.length;
      tty.renderer.start();
      expect(tty.output).toHaveLength(painted);
      tty.renderer.dispose();
    });

    it('writes one line when the client waits for a daemon that is still starting (task 95)', () => {
      const early: ITestRenderer = createRenderer(false);
      early.renderer.start();
      advance(early.clock, 300);
      early.renderer.onAwaitStartup(15_000);
      expect(early.lines()).toEqual([
        'rush build · 0.3s · rushd is still starting; waiting for it (up to 15s more)'
      ]);
      advance(early.clock, 1_000);
      early.renderer.onAwaitStartup(15_000);
      // The connecting line is not due after this line.
      advance(early.clock, 11_000);
      expect(early.output).toHaveLength(1);
      early.renderer.onRequestSent();
      early.renderer.dispose();
      expect(early.lines()).toEqual([
        'rush build · 0.3s · rushd is still starting; waiting for it (up to 15s more)',
        'rush build · 12.3s · sent to rushd; preparing the workspace graph (status at least every 25s)'
      ]);

      // As usual, the first startup deadline (15 s) comes after the connecting line.
      const { renderer, clock, lines } = createRenderer(false);
      renderer.start();
      advance(clock, 10_000);
      advance(clock, 5_000);
      renderer.onAwaitStartup(15_000);
      advance(clock, 6_000);
      renderer.onRequestSent();
      renderer.dispose();
      expect(lines()).toEqual([
        'rush build · 10.0s · connecting to rushd (auto-starts if needed)',
        'rush build · 15.0s · rushd is still starting; waiting for it (up to 15s more)',
        'rush build · 21.0s · sent to rushd; preparing the workspace graph (status at least every 25s)'
      ]);
    });

    it('names the process it waits for in the line for a daemon that is still starting', () => {
      const { renderer, clock, lines } = createRenderer(false);
      renderer.start();
      advance(clock, 300);
      renderer.onAwaitStartup(15_000, 'Its startup helper (PID 4242) is still waiting for the daemon');
      renderer.onAwaitStartup(14_000, 'Another client is still starting the daemon');
      renderer.dispose();
      expect(lines()).toEqual([
        'rush build · 0.3s · rushd is still starting; waiting for it (up to 15s more) because its startup ' +
          'helper (PID 4242) is still waiting for the daemon'
      ]);
    });

    it('writes nothing for a request that is handed to in-process Rush within 10 s', () => {
      const { renderer, output, clock } = createRenderer(false);
      renderer.start();
      advance(clock, 9000);
      renderer.dispose();
      advance(clock, 60_000);
      expect(output).toEqual([]);
    });

    it('writes a status line after 25 s of silence, with the running and failed operations', () => {
      const { renderer, clock, lines } = createRenderer(false);
      renderer.start();
      renderer.onRequestSent();
      for (const name of ['a', 'b', 'c', 'd', 'e']) {
        renderer.onEvent(registered(`${name} (build)`));
      }
      advance(clock, 20_000);
      renderer.onEvent(status('a (build)', 'EXECUTING'));
      renderer.onEvent(status('b (build)', 'EXECUTING'));
      advance(clock, 4999);
      expect(lines()).toHaveLength(1);
      advance(clock, 1);
      expect(lines()).toHaveLength(2);
      advance(clock, 20_000);
      renderer.onEvent(status('c (build)', 'EXECUTING'));
      renderer.onEvent(status('d (build)', 'EXECUTING'));
      renderer.onEvent(status('e (build)', 'EXECUTING'));
      fail(renderer, 'a (build)', ['error TS2322']);
      // The failure report postpones the status line that was due at 50 s.
      advance(clock, 24_999);
      expect(lines()).toHaveLength(4);
      advance(clock, 1);
      renderer.onEvent(status('b (build)', 'SUCCESS'));
      advance(clock, 25_000);
      clock.ms += 1000;
      renderer.finish({ exitCode: 1 });
      expect(lines()).toEqual([
        'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)',
        'rush build 0/5 · 25.0s · running: a (build), b (build)',
        // The failure report is written when the operation fails, and the next status line is due 25 s later.
        'failed: a (build) · full log: /repo/a/rush-logs/x.log',
        '  error TS2322',
        'rush build 1/5 · 70.0s · running: b (build), c (build), d (build) +1 more · failed: a (build)',
        'rush build 2/5 · 95.0s · running: c (build), d (build), e (build) · failed: a (build)',
        'rush build: FAILURE 2/5 operations (1 failure, 1 success) in 96.0s · failed: a (build)'
      ]);
    });

    it('does not claim that a request is still queued once it may have been admitted', () => {
      const { renderer, clock, lines } = createRenderer(false);
      renderer.start();
      renderer.onRequestSent();
      advance(clock, 2000);
      renderer.onQueuePosition(1);
      advance(clock, 23_000);
      renderer.onEvent(registered('a (build)'));
      renderer.onEvent(status('a (build)', 'EXECUTING'));
      advance(clock, 25_000);
      renderer.dispose();
      expect(lines()).toEqual([
        'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)',
        'rush build · 25.0s · waiting for admission or the workspace graph (queue position 1 at 2.0s)',
        'rush build 0/1 · 50.0s · running: a (build)'
      ]);
    });

    it('writes status lines after a failure report, and none after the summary', () => {
      const { renderer, output, clock, lines } = createRenderer(false);
      renderer.start();
      renderer.onRequestSent();
      renderer.onQueuePosition(1);
      renderer.onEvent(registered('a (build)'));
      renderer.onEvent(status('a (build)', 'EXECUTING'));
      fail(renderer, 'a (build)', ['error']);
      expect(lines()).toHaveLength(3);
      advance(clock, 25_000);
      expect(lines()[3]).toBe('rush build 1/1 · 25.0s · running · failed: a (build)');
      renderer.finish({ exitCode: 1 });
      const written: number = output.length;
      advance(clock, 100_000);
      expect(output).toHaveLength(written);
    });

    it('names a failed operation that wrote no output in a status line 1 s after it failed (#1792)', () => {
      const { renderer, clock, lines } = createRenderer(false);
      renderer.start();
      renderer.onRequestSent();
      for (const name of ['a', 'b', 'q']) {
        renderer.onEvent(registered(`${name} (build)`));
        renderer.onEvent(status(`${name} (build)`, 'EXECUTING'));
      }
      advance(clock, 2000);
      renderer.onEvent(status('q (build)', 'FAILURE', '/repo/q/rush-logs/x.log'));
      advance(clock, 999);
      expect(lines()).toHaveLength(1);
      advance(clock, 1);
      expect(lines()).toHaveLength(2);
      // The next status line is due 25 s after that one, as usual.
      advance(clock, 24_999);
      expect(lines()).toHaveLength(2);
      advance(clock, 1);
      renderer.finish({
        exitCode: 1,
        operationResults: [
          { operationId: 'a (build)', status: 'SUCCESS' },
          { operationId: 'b (build)', status: 'SUCCESS' },
          { operationId: 'q (build)', status: 'FAILURE', errorMessage: 'Returned error code: 1' }
        ]
      });
      expect(lines()).toEqual([
        'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)',
        'rush build 1/3 · 3.0s · running: a (build), b (build) · failed: q (build)',
        'rush build 1/3 · 28.0s · running: a (build), b (build) · failed: q (build)',
        'failed: q (build) · full log: /repo/q/rush-logs/x.log',
        '  Returned error code: 1',
        'rush build: FAILURE 3/3 operations (1 failure, 2 success) in 28.0s · failed: q (build)'
      ]);
    });

    it('writes no status line for a failure without output when the result comes within 1 s', () => {
      const { renderer, output, clock, lines } = createRenderer(false);
      renderer.start();
      renderer.onRequestSent();
      renderer.onEvent(registered('q (build)'));
      renderer.onEvent(registered('top (build)'));
      renderer.onEvent(status('q (build)', 'EXECUTING'));
      renderer.onEvent(status('q (build)', 'FAILURE'));
      renderer.onEvent(status('top (build)', 'BLOCKED'));
      advance(clock, 999);
      renderer.finish({
        exitCode: 1,
        operationResults: [
          { operationId: 'q (build)', status: 'FAILURE', errorMessage: 'Returned error code: 1' },
          { operationId: 'top (build)', status: 'BLOCKED' }
        ]
      });
      const written: number = output.length;
      advance(clock, 100_000);
      expect(output).toHaveLength(written);
      expect(lines()).toEqual([
        'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)',
        'failed: q (build)',
        '  Returned error code: 1',
        'rush build: FAILURE 2/2 operations (1 failure, 1 blocked) in 1.0s · failed: q (build)'
      ]);
    });

    it('names failures without output that no line named yet in one status line, however they interleave', () => {
      const { renderer, clock, lines } = createRenderer(false);
      renderer.start();
      renderer.onRequestSent();
      for (const name of ['a', 'b', 'q1', 'q2', 'q3']) {
        renderer.onEvent(registered(`${name} (build)`));
        renderer.onEvent(status(`${name} (build)`, 'EXECUTING'));
      }
      renderer.onEvent(status('q1 (build)', 'FAILURE'));
      advance(clock, 600);
      // A second failure without output does not postpone the line.
      renderer.onEvent(status('q2 (build)', 'FAILURE'));
      advance(clock, 399);
      expect(lines()).toHaveLength(1);
      advance(clock, 1);
      expect(lines()[1]).toBe(
        'rush build 2/5 · 1.0s · running: a (build), b (build), q3 (build) · failed: q1 (build), q2 (build)'
      );
      // A failure report does not name an earlier failure without output, so a status line follows 1 s after it.
      advance(clock, 5000);
      renderer.onEvent(status('q3 (build)', 'FAILURE'));
      advance(clock, 500);
      fail(renderer, 'a (build)', ['src/a.ts:1:1 - error TS2322: a']);
      advance(clock, 999);
      expect(lines()).toHaveLength(4);
      advance(clock, 1);
      renderer.dispose();
      expect(lines().slice(2)).toEqual([
        'failed: a (build) · full log: /repo/a/rush-logs/x.log',
        '  src/a.ts:1:1 - error TS2322: a',
        'rush build 4/5 · 7.5s · running: b (build) · failed: q1 (build), q2 (build), q3 (build) +1 more'
      ]);
    });

    it('writes a restart wait at once when it is announced, and then in place of the queue position (task 166)', () => {
      const { renderer, clock, lines } = createRenderer(false);
      const wait = (count: string): string =>
        `waiting for ${count} to finish; the daemon (PID 41) then restarts, because x changed`;
      renderer.start();
      renderer.onRequestSent();
      advance(clock, 400);
      renderer.onQueuePosition(1);
      advance(clock, 600);
      // It says whether it wrote the wait as a line, so the client knows whether a restart notice would repeat it.
      expect(renderer.onRestartWait(wait('2 running requests'), true)).toBe(true);
      advance(clock, 1000);
      expect(renderer.onRestartWait(wait('1 running request'), false)).toBe(false);
      advance(clock, 23_999);
      expect(lines()).toHaveLength(2);
      advance(clock, 1);
      renderer.dispose();
      expect(renderer.onRestartWait(wait('3 running requests'), true)).toBe(false);
      expect(lines()).toEqual([
        'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)',
        `rush build · 1.0s · ${wait('2 running requests')}`,
        `rush build · 26.0s · ${wait('1 running request')}`
      ]);
    });

    it('writes no restart wait once the client asked rushd to cancel the request (tasks 166 and 132)', () => {
      const { renderer, clock, lines } = createRenderer(false);
      const wait: string =
        'waiting for 1 running request to finish; the daemon (PID 41) then restarts, because x changed';
      renderer.start();
      renderer.onRequestSent();
      expect(renderer.onRestartWait(wait, true)).toBe(true);
      advance(clock, 2000);
      renderer.onCancelRequested(5_000);
      expect(renderer.onRestartWait(`${wait} again`, true)).toBe(false);
      advance(clock, 25_000);
      renderer.dispose();
      expect(lines()).toEqual([
        'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)',
        `rush build · 0.0s · ${wait}`,
        'rush build · 2.0s · cancelling; waiting up to 5s for rushd to stop the request',
        'rush build · 27.0s · cancelling; waiting up to 5s for rushd to stop the request'
      ]);
    });

    it('writes a note like any other line, so the next status line is due 25 s after it', () => {
      const { renderer, clock, lines } = createRenderer(false);
      renderer.start();
      renderer.onRequestSent();
      advance(clock, 20_000);
      renderer.note('rush-client: restarted the daemon.');
      advance(clock, 24_999);
      expect(lines()).toHaveLength(2);
      advance(clock, 1);
      renderer.dispose();
      expect(lines()).toEqual([
        'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)',
        'rush-client: restarted the daemon.',
        'rush build · 45.0s · sent to rushd; preparing the workspace graph'
      ]);
    });

    it('says at once that rushd has not responded, and in the status lines, until it responds again (task 69)', () => {
      const { renderer, clock, lines } = createRenderer(false);
      renderer.start();
      renderer.onRequestSent();
      for (const name of ['a', 'b', 'c', 'd', 'e']) {
        renderer.onEvent(registered(`${name} (build)`));
        renderer.onEvent(status(`${name} (build)`, 'EXECUTING'));
      }
      for (const name of ['a', 'b', 'c', 'd']) {
        renderer.onEvent(status(`${name} (build)`, 'SUCCESS'));
      }
      // rushd stops at 5 s; the client reports it once rushd has sent nothing for 30 s.
      advance(clock, 25_000);
      advance(clock, 10_000);
      renderer.onDaemonUnresponsive({ pid: 12345, silentForMs: 30_000 });
      advance(clock, 25_000);
      advance(clock, 15_200);
      renderer.onDaemonResponsive({ pid: 12345, silentForMs: 70_200 });
      advance(clock, 25_000);
      renderer.dispose();
      expect(lines()).toEqual([
        'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)',
        'rush build 4/5 · 25.0s · running: e (build)',
        'rush build 4/5 · 35.0s · rushd (PID 12345) has not responded for 30s; its process may be stopped or overloaded. This command goes on if rushd responds; interrupt it (Ctrl+C) to stop waiting',
        'rush build 4/5 · 60.0s · rushd (PID 12345) has not responded for 55s',
        'rush build 4/5 · 75.2s · rushd (PID 12345) responded again after 70s',
        'rush build 4/5 · 100.2s · running: e (build)'
      ]);
    });

    it('says nothing more about a silent rushd once the client asked it to cancel the request (task 69)', () => {
      const { renderer, clock, lines } = createRenderer(false);
      renderer.start();
      renderer.onRequestSent();
      advance(clock, 20_000);
      renderer.onDaemonUnresponsive({ pid: undefined, silentForMs: 20_000 });
      advance(clock, 2_000);
      renderer.onCancelRequested(5_000);
      renderer.onDaemonUnresponsive({ pid: undefined, silentForMs: 22_000 });
      renderer.onDaemonResponsive({ pid: undefined, silentForMs: 22_500 });
      advance(clock, 25_000);
      renderer.dispose();
      expect(lines()).toEqual([
        'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)',
        'rush build · 20.0s · rushd has not responded for 20s; its process may be stopped or overloaded. This command goes on if rushd responds; interrupt it (Ctrl+C) to stop waiting',
        'rush build · 22.0s · cancelling; waiting up to 5s for rushd to stop the request',
        'rush build · 47.0s · cancelling; waiting up to 5s for rushd to stop the request'
      ]);
    });
  });

  it('writes a note between progress lines on a pipe', () => {
    const { renderer, output } = createRenderer(false);
    renderer.start();
    renderer.onRequestSent();
    renderer.note('rush-client: restarted the daemon.');
    renderer.finish({ exitCode: 0 });
    renderer.note('after the summary');
    expect(output).toEqual([
      'rush build · 0.0s · sent to rushd; preparing the workspace graph (status at least every 25s)\n',
      'rush-client: restarted the daemon.\n',
      'rush build: SUCCESS up to date (no operations needed) in 0.0s\n'
    ]);
  });

  it('shows a restart wait as the phase of the live rows on a TTY, and writes no line for it', () => {
    const { renderer, output } = createRenderer(true, 'build', 200);
    renderer.start();
    expect(
      renderer.onRestartWait(
        'waiting for 1 running request to finish; the daemon (PID 41) then restarts',
        true
      )
    ).toBe(false);
    expect(output).toHaveLength(2);
    expect(output[1].replace(ANSI_ESCAPE, '')).toMatch(
      /^. rush build · 0\.0s · waiting for 1 running request to finish; the daemon \(PID 41\) then restarts\n/
    );
    renderer.dispose();
  });

  it('shows on a TTY that rushd has not responded, with what to do, until it responds again (task 69)', () => {
    const { renderer, output, clock } = createRenderer(true, 'build', 200);
    const firstRow = (text: string): string => text.replace(ANSI_ESCAPE, '').split('\n')[0];
    renderer.start();
    clock.ms = 35_000;
    renderer.onDaemonUnresponsive({ pid: 12345, silentForMs: 30_000 });
    expect(output).toHaveLength(2);
    expect(firstRow(output[1])).toMatch(
      /^. rush build · 35\.0s · rushd \(PID 12345\) has not responded for 30s; its process may be stopped or overloaded\. This command goes on if rushd responds; interrupt it \(Ctrl\+C\) to stop waiting$/
    );
    clock.ms = 75_200;
    renderer.onDaemonResponsive({ pid: 12345, silentForMs: 70_200 });
    expect(output).toHaveLength(3);
    expect(firstRow(output[2])).toMatch(/^. rush build · 75\.2s · connecting to rushd/);
    renderer.dispose();
  });

  it('writes a note above the live rows on a TTY and redraws them below it', () => {
    const { renderer, output } = createRenderer(true);
    renderer.start();
    renderer.note('rush-client: restarted the daemon.');
    expect(output.slice(1, 3)).toEqual(['\x1b[3A\x1b[0J\x1b[?25h', 'rush-client: restarted the daemon.\n']);
    expect(output[3].startsWith('\x1b[?25l')).toBe(true);
    expect(output[3].replace(ANSI_ESCAPE, '')).toMatch(/^. rush build · 0\.0s · connecting/);
    renderer.dispose();
  });

  it('renders at most three live rows on a TTY and clears them before the summary', () => {
    const { renderer, output } = createRenderer(true);
    renderer.start();
    renderer.onEvent(status('a-very-long-project-name-that-will-not-fit (build)', 'EXECUTING'));
    renderer.finish({ exitCode: 0 });
    const frames: string[] = output.slice(0, -2);
    for (const frame of frames) {
      const rows: string[] = frame.replace(ANSI_ESCAPE, '').split('\n');
      expect(rows.length).toBe(4); // three rows plus the trailing newline
      for (const row of rows) {
        expect(row.length).toBeLessThanOrEqual(59);
      }
    }
    expect(output[output.length - 2]).toBe('\x1b[3A\x1b[0J\x1b[?25h');
    expect(output[output.length - 1]).toContain('rush build: SUCCESS');
  });

  it('shows the wait for a daemon that is still starting as the phase on a TTY', () => {
    const { renderer, output } = createRenderer(true);
    renderer.start();
    renderer.onAwaitStartup(15_000);
    renderer.dispose();
    expect(output).toHaveLength(3);
    // The row is clipped to the 60 columns of the test terminal.
    expect(output[1].replace(ANSI_ESCAPE, '').split('\n')[0]).toMatch(
      /^. rush build · 0\.0s · rushd is still starting; waiting for…$/
    );
  });

  it('repaints a TTY on its timer rather than on every event, and shows failures in the last row', () => {
    jest.useFakeTimers();
    try {
      const { renderer, output } = createRenderer(true);
      renderer.start();
      for (let i: number = 0; i < 100; i++) {
        renderer.onEvent(status(`p${i} (build)`, 'EXECUTING'));
      }
      renderer.onEvent(status('p0 (build)', 'FAILURE'));
      expect(output).toHaveLength(1);
      jest.advanceTimersByTime(100);
      expect(output).toHaveLength(2);
      const rows: string[] = output[1].replace(ANSI_ESCAPE, '').split('\n');
      expect(rows[0]).toMatch(/^. rush build 1\/100 · 0\.0s · running$/);
      expect(rows[1]).toBe('running: p1 (build), p2 (build), p3 (build) +96 more');
      expect(rows[2]).toBe('failed: p0 (build)');
      renderer.dispose();
      jest.advanceTimersByTime(1000);
      expect(output).toHaveLength(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('writes no status line on a TTY for a failed operation that wrote no output', () => {
    jest.useFakeTimers();
    try {
      const { renderer, output } = createRenderer(true);
      renderer.start();
      renderer.onEvent(status('a (build)', 'EXECUTING'));
      renderer.onEvent(status('a (build)', 'FAILURE'));
      jest.advanceTimersByTime(30_000);
      expect(output.length).toBeGreaterThan(1);
      // Every write after the first paint repaints the live rows.
      expect(output.slice(1).filter((text) => !text.startsWith('\x1b[3A\x1b[0J'))).toEqual([]);
      renderer.dispose();
    } finally {
      jest.useRealTimers();
    }
  });
});
