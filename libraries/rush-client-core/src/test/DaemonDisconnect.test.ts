// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';
import {
  DaemonTransportError,
  DaemonTransportErrorCode,
  type IDaemonOrphanReap,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { captureDaemonRequest } from '../captureDaemonRequest';
import { DAEMON_DISCONNECTED_MESSAGE, DaemonClientError } from '../DaemonClientError';
import {
  DaemonExitedWhileQueuedError,
  explainLostConnectionAsync,
  findLoggedFatalError,
  observeServingDaemonAsync,
  type IServingDaemon
} from '../DaemonDisconnect';
import { getDaemonLogFilePath } from '../DaemonLogFile';
import { reserveDaemonStartup } from '../DaemonStartup';
import { isProcessDefunct } from '../ProcessStartTime';
import { findReclaimedDaemonPid } from '../ReclaimedDaemonLog';
import { tryAcquireStartupLockAsync, type IStartupLock } from '../StartupLock';
import {
  isRunning,
  recordDaemonOwner,
  startOrphanedOperationAsync,
  stopOperationIfRunning
} from './OrphanedOperation';
import { runThenRequireSymlinkedPackage, type IRequireAfterScriptResult } from './SymlinkedPackageRequire';
import { withUnreapedChildAsync } from './UnreapedChildProcess';

const linuxIt: typeof it = process.platform === 'linux' ? it : it.skip;
const posixIt: typeof it = process.platform === 'win32' ? it.skip : it;

describe(findLoggedFatalError.name, () => {
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

  // CI services often set FORCE_COLOR, with which Node.js colors its report although stderr is not a terminal.
  describe.each(['0', '1'])('with FORCE_COLOR=%s', (forceColor: string) => {
    /** The lines that this Node.js version writes to stderr when `script` fails with an uncaught error. */
    function getCrashReport(script: string): string[] {
      const { status, stderr } = spawnSync(process.execPath, ['-e', script], {
        encoding: 'utf8',
        env: { ...process.env, FORCE_COLOR: forceColor }
      });
      expect(status).not.toBe(0);
      return stderr.split(/\r?\n/);
    }

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
  let folder: string;
  let paths: IDaemonPaths;
  let operationPids: number[];

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-disconnect-'));
    paths = {
      runtimeDir: folder,
      socketPath: path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
    operationPids = [];
  });

  afterEach(async () => {
    operationPids.forEach(stopOperationIfRunning);
    await fs.promises.rm(folder, { recursive: true, force: true });
  });

  function getServingDaemon(pid: number, startedAt?: string): IServingDaemon {
    return { pid, startedAt, logFilePath: path.join(folder, 'missing.log'), logOffset: undefined, paths };
  }

  function getLostConnection(): DaemonTransportError {
    return new DaemonTransportError(
      DaemonTransportErrorCode.transportClosed,
      'The daemon connection closed.'
    );
  }

  function getExitMessage(pid: number): string {
    return `${DAEMON_DISCONNECTED_MESSAGE} rushd (PID ${pid}) exited while it ran the command; "rush-client daemon logs" may show why. Run the command again; if the daemon exits again, run the command with "rush-client --no-daemon".`;
  }

  it('returns other failures, and failures without a known daemon, unchanged', async () => {
    const timeout: DaemonClientError = new DaemonClientError('timeout', 'The daemon did not answer.');
    expect(await explainLostConnectionAsync(timeout, getServingDaemon(process.pid), request)).toBe(timeout);
    const lost: DaemonClientError = new DaemonClientError('disconnected', DAEMON_DISCONNECTED_MESSAGE);
    expect(await explainLostConnectionAsync(lost, undefined, request)).toBe(lost);
  });

  it('says that the command was queued when the daemon exited before it started the request', async () => {
    // A process that has exited.
    const exitedPid: number = spawnSync(process.execPath, ['-e', '']).pid!;
    const closed: DaemonTransportError = getLostConnection();
    const explained: unknown = await explainLostConnectionAsync(
      closed,
      getServingDaemon(exitedPid),
      request,
      undefined,
      true
    );
    expect(explained).toBeInstanceOf(DaemonExitedWhileQueuedError);
    expect(explained).toMatchObject({
      code: 'disconnected',
      cause: closed,
      daemonPid: exitedPid,
      message: getExitMessage(exitedPid).replace('while it ran the command', 'while the command was queued')
    });
    const ran: unknown = await explainLostConnectionAsync(closed, getServingDaemon(exitedPid), request);
    expect(ran).not.toBeInstanceOf(DaemonExitedWhileQueuedError);
    expect(ran).toMatchObject({ code: 'disconnected', message: getExitMessage(exitedPid) });
  });

  linuxIt('treats a daemon that exited but is not reaped yet as exited', async () => {
    await withUnreapedChildAsync(async (child) => {
      const deadline: number = Date.now() + 5000;
      while (!isProcessDefunct(child) && Date.now() < deadline) await delayAsync(20);
      const closed: DaemonTransportError = getLostConnection();
      const startedAt: number = Date.now();
      const explained: unknown = await explainLostConnectionAsync(closed, getServingDaemon(child), request);
      expect(Date.now() - startedAt).toBeLessThan(500);
      expect(explained).toBeInstanceOf(DaemonClientError);
      expect(explained).toMatchObject({
        code: 'disconnected',
        cause: closed,
        message: getExitMessage(child)
      });
    });
  });

  linuxIt(
    'stops the operations that an exited daemon left running, and removes its files, first',
    async () => {
      const warning: jest.SpyInstance = jest
        .spyOn(process, 'emitWarning')
        .mockImplementation(() => undefined);
      try {
        const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
        recordDaemonOwner(paths, daemonPid);
        const explained: unknown = await explainLostConnectionAsync(
          getLostConnection(),
          getServingDaemon(daemonPid),
          request
        );
        expect(explained).toMatchObject({ code: 'disconnected', message: getExitMessage(daemonPid) });
        expect(isRunning(operationPid)).toBe(false);
        expect(fs.existsSync(paths.lockfilePath)).toBe(false);
        expect(warning).toHaveBeenCalledWith(
          expect.stringContaining(`Reclaimed dead daemon ${daemonPid}:`),
          expect.objectContaining({ code: 'RUSH_DAEMON_ORPHANS_REAPED' })
        );
      } finally {
        warning.mockRestore();
      }
    }
  );

  linuxIt('reports what the reclaim stopped to onOrphansReaped instead of a process warning', async () => {
    const warning: jest.SpyInstance = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    try {
      const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
      recordDaemonOwner(paths, daemonPid);
      const reaps: IDaemonOrphanReap[] = [];
      const explained: unknown = await explainLostConnectionAsync(
        getLostConnection(),
        getServingDaemon(daemonPid),
        request,
        { onOrphansReaped: (reap: IDaemonOrphanReap) => reaps.push(reap) }
      );
      expect(explained).toMatchObject({ code: 'disconnected', message: getExitMessage(daemonPid) });
      expect(isRunning(operationPid)).toBe(false);
      // The stand-in daemon's operation shares its process group, as a phased operation does.
      expect(reaps).toEqual([{ daemonPid, processGroupIds: [daemonPid], outcome: 'terminated' }]);
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  linuxIt('reclaims an exited daemon that is not reaped yet once it is reaped', async () => {
    await withUnreapedChildAsync(async (child, parentPid) => {
      const deadline: number = Date.now() + 5000;
      while (!isProcessDefunct(child) && Date.now() < deadline) await delayAsync(20);
      recordDaemonOwner(paths, child);
      let settled: boolean = false;
      const explained: Promise<unknown> = explainLostConnectionAsync(
        getLostConnection(),
        getServingDaemon(child),
        request
      ).finally(() => {
        settled = true;
      });
      // The reclaim waits up to 1 s for the process to be reaped.
      await delayAsync(100);
      expect(settled).toBe(false);
      expect(fs.existsSync(paths.lockfilePath)).toBe(true);
      // Once its parent exits, init or a subreaper reaps it.
      process.kill(parentPid, 'SIGTERM');
      expect(await explained).toMatchObject({ message: getExitMessage(child) });
      expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    });
  });

  linuxIt('waits while another client holds the start mutex, and leaves the reclaim to it', async () => {
    const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
    recordDaemonOwner(paths, daemonPid);
    const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(paths);
    expect(lock).toBeDefined();
    let settled: boolean = false;
    const explained: Promise<unknown> = explainLostConnectionAsync(
      getLostConnection(),
      getServingDaemon(daemonPid),
      request
    ).finally(() => {
      settled = true;
    });
    await delayAsync(300);
    expect(settled).toBe(false);
    // The other client's reclaim ends by removing the ownership record.
    fs.unlinkSync(paths.lockfilePath);
    await lock!.releaseAsync();
    expect(await explained).toMatchObject({ message: getExitMessage(daemonPid) });
    expect(isRunning(operationPid)).toBe(true);
  });

  linuxIt(
    'gives up after a few seconds while another client keeps the start mutex',
    async () => {
      const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
      recordDaemonOwner(paths, daemonPid);
      const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(paths);
      expect(lock).toBeDefined();
      try {
        const startedAt: number = Date.now();
        expect(
          await explainLostConnectionAsync(getLostConnection(), getServingDaemon(daemonPid), request)
        ).toMatchObject({ message: getExitMessage(daemonPid) });
        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(4500);
        expect(Date.now() - startedAt).toBeLessThan(10000);
        expect(isRunning(operationPid)).toBe(true);
        expect(fs.existsSync(paths.lockfilePath)).toBe(true);
      } finally {
        await lock!.releaseAsync();
      }
    },
    20000
  );

  linuxIt('leaves an exited daemon to the startup that is reserved', async () => {
    const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
    recordDaemonOwner(paths, daemonPid);
    reserveDaemonStartup(paths, { pid: process.pid, startedAt: new Date().toISOString() });
    const startedAt: number = Date.now();
    expect(
      await explainLostConnectionAsync(getLostConnection(), getServingDaemon(daemonPid), request)
    ).toMatchObject({ message: getExitMessage(daemonPid) });
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(isRunning(operationPid)).toBe(true);
    expect(fs.existsSync(paths.lockfilePath)).toBe(true);
    expect(fs.existsSync(getDaemonLogFilePath(paths))).toBe(false);
  });

  linuxIt('leaves the files alone when the ownership record names another daemon', async () => {
    const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
    recordDaemonOwner(paths, daemonPid);
    // A process that has exited, which the record does not name.
    const otherPid: number = spawnSync(process.execPath, ['-e', '']).pid!;
    // The same PID, but a record written for another process.
    for (const daemon of [
      getServingDaemon(otherPid),
      getServingDaemon(daemonPid, '2000-01-01T00:00:00.000Z')
    ]) {
      expect(await explainLostConnectionAsync(getLostConnection(), daemon, request)).toMatchObject({
        message: getExitMessage(daemon.pid)
      });
      expect(isRunning(operationPid)).toBe(true);
      expect(fs.existsSync(paths.lockfilePath)).toBe(true);
    }
  });

  linuxIt('still explains the exit when the reclaim fails', async () => {
    const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
    recordDaemonOwner(paths, daemonPid);
    // Another process, such as a starting daemon, holds the reclaim's own mutex, so the reclaim throws.
    fs.writeFileSync(`${paths.lockfilePath}.reclaim`, JSON.stringify({ mutexPid: process.pid }));
    expect(
      await explainLostConnectionAsync(getLostConnection(), getServingDaemon(daemonPid), request)
    ).toMatchObject({ code: 'disconnected', message: getExitMessage(daemonPid) });
    expect(isRunning(operationPid)).toBe(true);
    expect(fs.existsSync(paths.lockfilePath)).toBe(true);
    expect(fs.existsSync(getDaemonLogFilePath(paths))).toBe(false);
  });

  linuxIt('logs the reclaim, so that the daemon can be named after its record is gone', async () => {
    const warning: jest.SpyInstance = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    try {
      const { daemonPid } = await startOrphanedOperationAsync(operationPids);
      recordDaemonOwner(paths, daemonPid);
      expect(
        await explainLostConnectionAsync(getLostConnection(), getServingDaemon(daemonPid), request)
      ).toMatchObject({ code: 'disconnected', message: getExitMessage(daemonPid) });
      expect(fs.existsSync(paths.lockfilePath)).toBe(false);
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining(`Reclaimed dead daemon ${daemonPid}:`),
        expect.objectContaining({ code: 'RUSH_DAEMON_ORPHANS_REAPED' })
      );
      expect(fs.readFileSync(getDaemonLogFilePath(paths), 'utf8').split('\n')).toEqual([
        expect.stringMatching(
          new RegExp(
            `^\\S+Z rush-client \\(PID ${process.pid}\\): rushd \\(PID ${daemonPid}\\) exited without`
          )
        ),
        ''
      ]);
      expect(findReclaimedDaemonPid(paths)).toBe(daemonPid);
    } finally {
      warning.mockRestore();
    }
  });

  // For example, Rush that runs in-process after the daemon exited. Jest resolves modules itself, so a Node
  // process of its own makes the call.
  posixIt('leaves require() resolving symlinks after it read a launcher log that is a FIFO', () => {
    const logFilePath: string = getDaemonLogFilePath(paths);
    expect(spawnSync('mkfifo', ['-m', '600', logFilePath]).status).toBe(0);
    // A process that has exited.
    const pid: number = spawnSync(process.execPath, ['-e', '']).pid!;
    const daemon: IServingDaemon = { pid, startedAt: undefined, logFilePath, logOffset: 0, paths };
    const result: IRequireAfterScriptResult = runThenRequireSymlinkedPackage(
      folder,
      [
        'const [modulePath, daemonJson, requestJson] = args;',
        "const lost = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });",
        'const { explainLostConnectionAsync } = require(modulePath);',
        'const explained = await explainLostConnectionAsync(lost, JSON.parse(daemonJson), JSON.parse(requestJson));',
        'process.stdout.write(`${explained.message}\\n`);'
      ].join('\n'),
      [require.resolve('../DaemonDisconnect'), JSON.stringify(daemon), JSON.stringify(request)]
    );
    expect(result).toEqual({ status: 0, stdout: `${getExitMessage(pid)}\nfound`, stderr: '' });
  });
});

describe(observeServingDaemonAsync.name, () => {
  let folder: string;
  let paths: IDaemonPaths;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-serving-daemon-'));
    paths = {
      runtimeDir: folder,
      socketPath: path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
  });

  afterEach(async () => {
    await fs.promises.rm(folder, { recursive: true, force: true });
  });

  // For example, Rush that runs in-process after the daemon exited. Jest resolves modules itself, so a Node
  // process of its own makes the call.
  posixIt('leaves require() resolving symlinks after it measured a launcher log that is a FIFO', () => {
    expect(spawnSync('mkfifo', ['-m', '600', getDaemonLogFilePath(paths)]).status).toBe(0);
    const result: IRequireAfterScriptResult = runThenRequireSymlinkedPackage(
      folder,
      [
        'const [modulePath, pathsJson] = args;',
        'const client = { status: Promise.resolve({ pid: process.pid }) };',
        'const { observeServingDaemonAsync } = require(modulePath);',
        'const daemon = await observeServingDaemonAsync(client, JSON.parse(pathsJson));',
        'process.stdout.write(`${daemon.logOffset}\\n`);'
      ].join('\n'),
      [require.resolve('../DaemonDisconnect'), JSON.stringify(paths)]
    );
    // The log is not a regular file, so the client does not read it later.
    expect(result).toEqual({ status: 0, stdout: 'undefined\nfound', stderr: '' });
  });
});
