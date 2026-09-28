// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';
import { DaemonTransportError, DaemonTransportErrorCode } from '@rushstack/rush-daemon-transport';

import { captureDaemonRequest } from '../captureDaemonRequest';
import { DAEMON_DISCONNECTED_MESSAGE, DaemonClientError } from '../DaemonClientError';
import { explainLostConnectionAsync, findLoggedFatalError, type IServingDaemon } from '../DaemonDisconnect';
import { isProcessDefunct } from '../ProcessStartTime';
import { withUnreapedChildAsync } from './UnreapedChildProcess';

const linuxIt: typeof it = process.platform === 'linux' ? it : it.skip;

/** The lines that this Node.js version writes to stderr when `script` fails with an uncaught error. */
function getCrashReport(script: string): string[] {
  const { status, stderr } = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  expect(status).not.toBe(0);
  return stderr.split(/\r?\n/);
}

describe(findLoggedFatalError.name, () => {
  it('returns the message of an uncaught error without its stack', () => {
    const report: string[] = getCrashReport("setImmediate(() => { throw new Error('first\\nsecond'); })");
    expect(findLoggedFatalError(['rushd started', ...report])).toBe('Error: first second');
  });

  it('returns the message of an unhandled rejection', () => {
    expect(findLoggedFatalError(getCrashReport("Promise.reject(new TypeError('rejected'))"))).toBe(
      'TypeError: rejected'
    );
    expect(findLoggedFatalError(getCrashReport("Promise.reject('reason')"))).toMatch(
      /^UnhandledPromiseRejection: .* "reason"\.$/
    );
  });

  it('returns a thrown value that is not an error', () => {
    expect(findLoggedFatalError(getCrashReport("throw 'a plain string'"))).toBe('a plain string');
  });

  it("returns V8's fatal error line", () => {
    const lines: string[] = [
      '<--- JS stacktrace --->',
      '',
      'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      '----- Native stack trace -----'
    ];
    expect(findLoggedFatalError(lines)).toBe(
      'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'
    );
  });

  it('returns the first report', () => {
    const lines: string[] = [
      ...getCrashReport("throw new Error('first')"),
      ...getCrashReport("throw new Error('second')")
    ];
    expect(findLoggedFatalError(lines)).toBe('Error: first');
  });

  it('returns undefined without a complete report', () => {
    const report: string[] = getCrashReport("throw new Error('boom')");
    const trailer: number = report.findIndex((line) => line.startsWith('Node.js v'));
    expect(trailer).toBeGreaterThan(0);
    expect(findLoggedFatalError(report.slice(0, trailer))).toBeUndefined();
    expect(findLoggedFatalError(report.slice(3))).toBeUndefined();
    expect(findLoggedFatalError(['rushd started', 'Node.js v22.0.0'])).toBeUndefined();
  });
});

describe(explainLostConnectionAsync.name, () => {
  const request: IDaemonRequestEnvelope = captureDaemonRequest({
    argv: ['build'],
    commandName: 'build',
    commandOrigin: 'built-in',
    cwd: os.tmpdir(),
    environment: {},
    terminal: { isTTY: false, supportsColor: false }
  });

  function getServingDaemon(pid: number): IServingDaemon {
    return {
      pid,
      startedAt: undefined,
      logFilePath: path.join(os.tmpdir(), 'missing.log'),
      logOffset: undefined
    };
  }

  it('returns other failures, and failures without a known daemon, unchanged', async () => {
    const timeout: DaemonClientError = new DaemonClientError('timeout', 'The daemon did not answer.');
    expect(await explainLostConnectionAsync(timeout, getServingDaemon(process.pid), request)).toBe(timeout);
    const lost: DaemonClientError = new DaemonClientError('disconnected', DAEMON_DISCONNECTED_MESSAGE);
    expect(await explainLostConnectionAsync(lost, undefined, request)).toBe(lost);
  });

  linuxIt('treats a daemon that exited but is not reaped yet as exited', async () => {
    await withUnreapedChildAsync(async (child) => {
      const deadline: number = Date.now() + 5000;
      while (!isProcessDefunct(child) && Date.now() < deadline) await delayAsync(20);
      const closed: DaemonTransportError = new DaemonTransportError(
        DaemonTransportErrorCode.transportClosed,
        'The daemon connection closed.'
      );
      const startedAt: number = Date.now();
      const explained: unknown = await explainLostConnectionAsync(closed, getServingDaemon(child), request);
      expect(Date.now() - startedAt).toBeLessThan(500);
      expect(explained).toBeInstanceOf(DaemonClientError);
      expect(explained).toMatchObject({
        code: 'disconnected',
        cause: closed,
        message: `${DAEMON_DISCONNECTED_MESSAGE} rushd (PID ${child}) exited while it ran the command; "rush-client daemon logs" may show why. Run the command again; if the daemon exits again, run the command with "rush-client --no-daemon".`
      });
    });
  });
});
