// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import { DaemonFrameListener, type IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { DaemonClientError } from '../DaemonClientError';
import {
  createUnresponsiveOwnerError,
  describeRecordOwner,
  describeUnresponsiveOwner,
  diagnoseDaemonOwner,
  getDaemonOwnerHint,
  getDefaultOwnerProcessReaders,
  LiveDaemonOwnerError,
  type IDaemonOwnerDiagnosis,
  type IOwnerProcessReaders
} from '../DaemonOwnerDiagnosis';
import { runThenRequireSymlinkedPackage, type IRequireAfterScriptResult } from './SymlinkedPackageRequire';

const PID: number = 4242;
const SOCKET: string = '/run/user/1000/rush/abc.sock';
const LOCKFILE: string = '/run/user/1000/rush/abc.pid.json';
const PATHS: IDaemonPaths = {
  runtimeDir: '/run/user/1000/rush',
  socketPath: SOCKET,
  lockfilePath: LOCKFILE
};
const NOW: number = Date.parse('2026-09-29T10:00:00.000Z');
const RUSHD: string[] = ['/usr/bin/node', '/x/node_modules/@rushstack/rush-daemon/lib-commonjs/start.js'];
const HEDGED_HINT: string = `It may be busy, stopped or shutting down, or not this workspace's daemon; "rush-client daemon logs" shows the daemon's last lines. If it is this workspace's daemon, end that process; if it is not, delete ${LOCKFILE}. Either way, the next command then starts a new daemon.`;

function readers(overrides: Partial<IOwnerProcessReaders> = {}): IOwnerProcessReaders {
  return {
    platform: 'linux',
    now: () => NOW,
    readState: () => ({ code: 'S', parentPid: 1 }),
    readStartTimeMs: () => NOW - 3 * 60_000,
    readCommandLine: () => RUSHD,
    isPresent: () => true,
    hasFileOpen: (pid: number, filePath: string) => pid === PID && filePath === LOCKFILE,
    ...overrides
  };
}

function diagnose(overrides: Partial<IOwnerProcessReaders> = {}): IDaemonOwnerDiagnosis {
  return diagnoseDaemonOwner(PID, PATHS, readers(overrides));
}

function hint(diagnosis: IDaemonOwnerDiagnosis, purpose: 'use' | 'stop' = 'use'): string {
  return getDaemonOwnerHint(diagnosis, LOCKFILE, purpose);
}

describe('diagnoseDaemonOwner', () => {
  it('says that a signal stopped the daemon, and how to resume it', () => {
    const diagnosis: IDaemonOwnerDiagnosis = diagnose({ readState: () => ({ code: 'T', parentPid: 1 }) });
    expect(describeUnresponsiveOwner(diagnosis)).toBe(
      `The daemon, rushd (PID ${PID}), did not answer at ${SOCKET}: it is stopped (state T), for example by SIGSTOP, and it started 3 min ago.`
    );
    expect(hint(diagnosis)).toBe(`Resume it with "kill -CONT ${PID}"; it then serves the next command.`);
    expect(hint(diagnosis, 'stop')).toBe(
      `Resume it with "kill -CONT ${PID}", then run "rush-client daemon stop" again.`
    );
  });

  it('asks a stopped daemon without a socket to exit once it resumes', () => {
    const diagnosis: IDaemonOwnerDiagnosis = diagnose({
      readState: () => ({ code: 'T', parentPid: 1 }),
      isPresent: () => false
    });
    expect(describeRecordOwner(diagnosis, LOCKFILE)).toBe(
      `rushd (PID ${PID}) still owns ${LOCKFILE}: its socket is missing, so no client can reach it; it is stopped (state T), for example by SIGSTOP, and it started 3 min ago.`
    );
    expect(hint(diagnosis, 'use')).toBe(hint(diagnosis, 'stop'));
    expect(hint(diagnosis)).toBe(
      `Run "kill ${PID}", then "kill -CONT ${PID}": it then cancels its running requests and exits, and the next command starts a new daemon.`
    );
  });

  it.each([
    [
      't',
      'it is stopped by a debugger or tracer (state t)',
      'It answers once the debugger or tracer lets it run.'
    ],
    [
      'D',
      'it is waiting in the kernel (state D), for example on a slow disk or network file system',
      'It handles no signal until that wait ends; retry then.'
    ]
  ])('describes state %s', (code: string, description: string, expectedHint: string) => {
    const diagnosis: IDaemonOwnerDiagnosis = diagnose({ readState: () => ({ code, parentPid: 1 }) });
    expect(diagnosis.facts).toBe(`: ${description}, and it started 3 min ago`);
    expect(hint(diagnosis)).toBe(expectedHint);
  });

  it('names the parent that has not reaped an owner that exited', () => {
    const diagnosis: IDaemonOwnerDiagnosis = diagnose({
      readState: () => ({ code: 'Z', parentPid: 77 }),
      // A zombie has no command line.
      readCommandLine: () => undefined
    });
    expect(describeUnresponsiveOwner(diagnosis)).toBe(
      `The daemon did not answer at ${SOCKET}, and its ownership record names PID ${PID}: it has exited, but its parent process (PID 77) has not reaped it (state Z), and it started 3 min ago.`
    );
    expect(hint(diagnosis)).toBe('The next command reclaims its files once PID 77 reaps it.');
  });

  it('tells a busy daemon from one that lost its socket', () => {
    const busy: IDaemonOwnerDiagnosis = diagnose({ readState: () => ({ code: 'R', parentPid: 1 }) });
    expect(busy.facts).toBe(': it is running (state R), and it started 3 min ago');
    expect(hint(busy)).toBe(
      `It may be busy or shutting down; "rush-client daemon logs" shows its last lines. "kill ${PID}" asks it to cancel its running requests and exit; the next command then starts a new daemon.`
    );
    const socketless: IDaemonOwnerDiagnosis = diagnose({ isPresent: () => false });
    expect(socketless.facts).toBe(
      `: its socket is missing, so no client can reach it; it is waiting (state S), and it started 3 min ago`
    );
    expect(hint(socketless)).toBe(
      `It may exit on its own once its running requests finish; "kill ${PID}" asks it to cancel them and exit. The next command then starts a new daemon.`
    );
  });

  it('says so when the owner is not a Rush daemon, and shows its command line', () => {
    const diagnosis: IDaemonOwnerDiagnosis = diagnose({ readCommandLine: () => ['sleep', '600'] });
    expect(diagnosis.isRushDaemon).toBe(false);
    expect(describeUnresponsiveOwner(diagnosis)).toBe(
      `The daemon did not answer at ${SOCKET}, and its ownership record names PID ${PID} ("sleep 600"): it is waiting (state S), and it started 3 min ago.`
    );
    expect(hint(diagnosis, 'stop')).toBe(
      `It does not look like a Rush daemon. If no daemon runs for this workspace, delete ${LOCKFILE}; the next command then starts a new daemon.`
    );
    const long: IDaemonOwnerDiagnosis = diagnose({ readCommandLine: () => ['x'.repeat(40), 'y'.repeat(40)] });
    expect(long.subject).toBe(`PID ${PID} ("${'x'.repeat(40)} ${'y'.repeat(16)}...")`);
  });

  it("names no signal for a Rush daemon that does not have this workspace's record open", () => {
    for (const hasFileOpen of [(): false => false, (): undefined => undefined]) {
      const diagnosis: IDaemonOwnerDiagnosis = diagnose({
        readState: () => ({ code: 'T', parentPid: 1 }),
        hasFileOpen
      });
      expect(diagnosis.isRushDaemon).toBe(true);
      expect(diagnosis.isWorkspaceDaemon).toBe(false);
      expect(describeUnresponsiveOwner(diagnosis)).toBe(
        `The daemon did not answer at ${SOCKET}, and its ownership record names rushd (PID ${PID}): it is stopped (state T), for example by SIGSTOP, and it started 3 min ago.`
      );
      expect(hint(diagnosis)).toBe(HEDGED_HINT);
      expect(hint(diagnosis, 'stop')).toBe(HEDGED_HINT);
    }
  });

  it.each([
    [['node', '/home/u/.rush/node-v22/@rushstack/rush-daemon/lib-commonjs/start.js'], true],
    [
      [
        '/usr/bin/node',
        '/r/common/temp/node_modules/.pnpm/@rushstack+rush-daemon@0.1.0/node_modules/@rushstack/rush-daemon/lib-commonjs/SelectedDaemonBootstrap.js',
        '--launch',
        '/r/package.json',
        '5.179.0',
        '/r'
      ],
      true
    ],
    [['node', '--max-old-space-size=4096', '/w/libraries/rush-daemon/lib-commonjs/start.js'], true],
    [['C:\\node.exe', 'C:\\x\\rush-daemon\\lib-commonjs\\start.js'], true],
    [['rushd'], true],
    [['/usr/local/bin/rushd', '--foreground'], true],
    [['node', '/w/common/temp/node_modules/.bin/rushd'], true],
    [['node', '/home/u/src/my-rush-daemon/start.js'], false],
    [['node', '/home/u/src/rush-daemon-protocol/lib/index.js'], false],
    // A tool that builds or tests the rush-daemon package is not a Rush daemon.
    [['node', '/w/libraries/rush-daemon/node_modules/.bin/../@rushstack/heft/bin/heft', 'build'], false],
    [['node', '/w/libraries/rush-daemon/node_modules/jest/bin/jest.js'], false],
    [
      ['node', '/w/common/temp/heft/lib/start.js', '--cwd', '/w/libraries/rush-daemon/lib-commonjs/start.js'],
      false
    ],
    [['/w/libraries/rush-daemon/node_modules/.bin/tsc'], false],
    [['node', '/w/libraries/rush-daemon'], false],
    [['node', '--inspect'], false],
    [[], false]
  ])('recognizes a Rush daemon by its command line %j', (commandLine: string[], expected: boolean) => {
    expect(diagnose({ readCommandLine: () => commandLine }).isRushDaemon).toBe(expected);
  });

  it('reports only what it can read', () => {
    const unknown: Partial<IOwnerProcessReaders> = {
      readState: () => undefined,
      readStartTimeMs: () => undefined,
      readCommandLine: () => undefined
    };
    const diagnosis: IDaemonOwnerDiagnosis = diagnose(unknown);
    expect(diagnosis.isRushDaemon).toBeUndefined();
    expect(describeUnresponsiveOwner(diagnosis)).toBe(
      `The daemon did not answer at ${SOCKET}, and its ownership record names PID ${PID}.`
    );
    expect(hint(diagnosis)).toBe(HEDGED_HINT);
    // Windows names a pipe, which leaves no file to check.
    const windows: IDaemonOwnerDiagnosis = diagnose({
      ...unknown,
      platform: 'win32',
      isPresent: () => false,
      hasFileOpen: () => undefined
    });
    expect(windows.facts).toBe('');
    expect(hint(windows, 'stop')).toBe(HEDGED_HINT);
  });

  it.each([
    [-5000, '0 s'],
    [59_999, '59 s'],
    [60_000, '1 min'],
    [3_599_999, '59 min'],
    [2 * 3_600_000 + 5 * 60_000, '2 h 5 min']
  ])('formats an age of %d ms as %s', (ageMs: number, expected: string) => {
    expect(diagnose({ readStartTimeMs: () => NOW - ageMs }).facts).toBe(
      `: it is waiting (state S), and it started ${expected} ago`
    );
  });

  it('builds the error that a client throws when the owner did not answer', () => {
    const error: LiveDaemonOwnerError = createUnresponsiveOwnerError(
      PID,
      PATHS,
      readers({ readState: () => ({ code: 'T', parentPid: 1 }) })
    );
    expect(error).toBeInstanceOf(LiveDaemonOwnerError);
    expect(error).toBeInstanceOf(DaemonClientError);
    expect(error.code).toBe('startupFailed');
    expect(error.message).toBe(`${error.description}\n${error.hint}`);
    expect(error.description).toContain(
      `rushd (PID ${PID}), did not answer at ${SOCKET}: it is stopped (state T)`
    );
    expect(error.hint).toContain(`kill -CONT ${PID}`);
  });

  (process.platform === 'linux' ? it : it.skip)('reads this process from /proc', () => {
    const diagnosis: IDaemonOwnerDiagnosis = diagnoseDaemonOwner(
      process.pid,
      { socketPath: __filename, lockfilePath: __filename },
      getDefaultOwnerProcessReaders()
    );
    expect(diagnosis.isRushDaemon).toBe(false);
    expect(diagnosis.isWorkspaceDaemon).toBe(false);
    expect(diagnosis.isSocketMissing).toBe(false);
    expect(diagnosis.subject).toMatch(new RegExp(`^PID ${process.pid} \\(".+"\\)$`));
    expect(diagnosis.facts).toMatch(
      /^: it is (running|waiting) \(state [RS]\), and it started \d+ (s|min) ago$/
    );
  });

  (process.platform === 'linux' ? it : it.skip)(
    'proves from /proc which process has a daemon ownership record open',
    async () => {
      const { hasFileOpen } = getDefaultOwnerProcessReaders();
      const folder: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-owner-'));
      const link: string = `${folder}-link`;
      await fs.promises.symlink(folder, link);
      const paths: IDaemonPaths = {
        runtimeDir: folder,
        socketPath: path.join(folder, 'd.sock'),
        lockfilePath: path.join(folder, 'd.pid.json')
      };
      const otherFile: string = path.join(folder, 'other.pid.json');
      await fs.promises.writeFile(otherFile, '');
      let listener: DaemonFrameListener | undefined;
      let other: ChildProcess | undefined;
      try {
        // As rushd does: it publishes its socket, then writes its record and keeps it open.
        listener = await DaemonFrameListener.listenAsync(paths, {
          protocolVersion: DAEMON_PROTOCOL_VERSION,
          onConnection: () => undefined
        });
        expect(hasFileOpen(process.pid, paths.lockfilePath)).toBe(true);
        // The kernel names the file by its real path.
        expect(hasFileOpen(process.pid, path.join(link, 'd.pid.json'))).toBe(true);
        expect(hasFileOpen(process.pid, otherFile)).toBe(false);
        await fs.promises.unlink(paths.socketPath);
        expect(hasFileOpen(process.pid, paths.lockfilePath)).toBe(true);
        // Another process, which has another file open.
        other = spawn(
          process.execPath,
          [
            '-e',
            "require('node:fs').openSync(process.argv[1], 'r'); console.log('open'); setInterval(() => {}, 1000)",
            otherFile
          ],
          { stdio: ['ignore', 'pipe', 'ignore'] }
        );
        await once(other.stdout!, 'data');
        expect(hasFileOpen(other.pid!, otherFile)).toBe(true);
        expect(hasFileOpen(other.pid!, paths.lockfilePath)).toBe(false);
        // A file that took the record's path later is not the one that this process has open.
        await fs.promises.unlink(paths.lockfilePath);
        await fs.promises.writeFile(paths.lockfilePath, '{}');
        expect(hasFileOpen(process.pid, paths.lockfilePath)).toBe(false);
      } finally {
        await listener?.closeAsync();
        if (other && other.exitCode === null && other.signalCode === null) {
          const exited: Promise<unknown> = once(other, 'exit');
          // Only the process that this test started, by its PID.
          other.kill('SIGKILL');
          await exited;
        }
      }
      expect(hasFileOpen(process.pid, otherFile)).toBe(false);
      expect(hasFileOpen(process.pid, path.join(folder, 'missing'))).toBeUndefined();
      await fs.promises.rm(link);
      await fs.promises.rm(folder, { recursive: true, force: true });
    }
  );

  // A failed command can load the daemon launcher only after the diagnosis found the socket.
  (process.platform === 'win32' ? it.skip : it)(
    'leaves require() resolving symlinks after it finds the socket',
    async () => {
      // Short, as a socket path must be.
      const folder: string = await fs.promises.mkdtemp('/tmp/rush-owner-require-');
      try {
        const result: IRequireAfterScriptResult = runThenRequireSymlinkedPackage(
          folder,
          [
            "const net = require('node:net');",
            'const [modulePath, socketPath, lockfilePath] = args;',
            'const server = net.createServer();',
            'await new Promise((resolve) => server.listen(socketPath, resolve));',
            'const { diagnoseDaemonOwner } = require(modulePath);',
            "const paths = { runtimeDir: '', socketPath, lockfilePath };",
            'process.stdout.write(`${diagnoseDaemonOwner(process.pid, paths).isSocketMissing} `);',
            'server.close();'
          ].join('\n'),
          [
            require.resolve('../DaemonOwnerDiagnosis'),
            path.join(folder, 'd.sock'),
            path.join(folder, 'd.pid.json')
          ]
        );

        expect(result).toEqual({ status: 0, stdout: 'false found', stderr: '' });
      } finally {
        await fs.promises.rm(folder, { recursive: true, force: true });
      }
    }
  );
});
