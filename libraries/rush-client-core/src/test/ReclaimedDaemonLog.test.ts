// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { getDaemonLogFilePath } from '../DaemonLogFile';
import { resetDaemonArtifactsAsync } from '../DaemonOwnership';
import { findReclaimedDaemonPid, logReclaimedDaemon } from '../ReclaimedDaemonLog';

const posixIt: typeof it = process.platform === 'win32' ? it.skip : it;

/** The line that a client appends after it reclaimed the daemon with this PID. */
function getReclaimLine(pid: number): RegExp {
  return new RegExp(
    `^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z rush-client \\(PID ${process.pid}\\): rushd \\(PID ${pid}\\) ` +
      'exited without shutting down; stopped any operations it left running and removed its ownership record and socket\\.$'
  );
}

describe(findReclaimedDaemonPid.name, () => {
  let folder: string;
  let paths: IDaemonPaths;
  let logFilePath: string;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-reclaim-log-'));
    paths = {
      runtimeDir: folder,
      socketPath: path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
    logFilePath = getDaemonLogFilePath(paths);
  });

  afterEach(async () => {
    await fs.promises.rm(folder, { recursive: true, force: true });
  });

  function readLogLines(): string[] {
    return fs.readFileSync(logFilePath, 'utf8').split('\n');
  }

  it('returns the PID that the last reclaim logged', () => {
    expect(findReclaimedDaemonPid(paths)).toBeUndefined();
    logReclaimedDaemon(paths, 101);
    expect(readLogLines()).toEqual([expect.stringMatching(getReclaimLine(101)), '']);
    expect(findReclaimedDaemonPid(paths)).toBe(101);
    // For example, the output of a daemon that failed to start.
    fs.appendFileSync(logFilePath, 'Error: listen EADDRINUSE\n');
    expect(findReclaimedDaemonPid(paths)).toBe(101);
    logReclaimedDaemon(paths, 102);
    expect(readLogLines()).toEqual([
      expect.stringMatching(getReclaimLine(101)),
      'Error: listen EADDRINUSE',
      expect.stringMatching(getReclaimLine(102)),
      ''
    ]);
    expect(findReclaimedDaemonPid(paths)).toBe(102);
  });

  it('returns undefined once a daemon became ready after the reclaim', () => {
    for (const ready of [
      'rushd ready at /run/d.sock (Rush 5.0.0)',
      '2026-09-29T00:00:00.000Z rushd ready at /run/d.sock (Rush 5.0.0, PID 7)'
    ]) {
      logReclaimedDaemon(paths, 101);
      fs.appendFileSync(logFilePath, `${ready}\n`);
      expect(findReclaimedDaemonPid(paths)).toBeUndefined();
    }
    logReclaimedDaemon(paths, 103);
    expect(findReclaimedDaemonPid(paths)).toBe(103);
  });

  it("ignores a daemon's output that quotes the line", () => {
    fs.writeFileSync(
      logFilePath,
      'Error: 2026-09-29T00:00:00.000Z rush-client (PID 1): rushd (PID 99) exited without shutting down; x\n'
    );
    expect(findReclaimedDaemonPid(paths)).toBeUndefined();
  });

  it('reads only the complete lines in the last 64 KiB of the log', () => {
    logReclaimedDaemon(paths, 104);
    const lineLength: number = fs.statSync(logFilePath).size;
    // The read then starts 5 bytes into the line, after "2026-"; the rest of it would still look like a reclaim.
    fs.appendFileSync(logFilePath, `${'x'.repeat(64 * 1024 - lineLength + 4)}\n`);
    expect(fs.statSync(logFilePath).size - 64 * 1024).toBe(5);
    expect(findReclaimedDaemonPid(paths)).toBeUndefined();
    logReclaimedDaemon(paths, 105);
    expect(findReclaimedDaemonPid(paths)).toBe(105);
  });

  it('starts its line on a line of its own when the log ends inside a line', async () => {
    // For example, the output of a daemon that was killed before it finished a line.
    fs.writeFileSync(logFilePath, 'Error: boom');
    logReclaimedDaemon(paths, 109);
    expect(readLogLines()).toEqual(['Error: boom', expect.stringMatching(getReclaimLine(109)), '']);
    expect(findReclaimedDaemonPid(paths)).toBe(109);
    fs.appendFileSync(logFilePath, '    at boom');
    await resetDaemonArtifactsAsync(paths);
    expect(findReclaimedDaemonPid(paths)).toBeUndefined();
    expect(readLogLines()).toEqual([
      'Error: boom',
      expect.stringMatching(getReclaimLine(109)),
      '    at boom',
      expect.stringMatching(/^\S+Z rush-client \(PID \d+\): reset the daemon's files; /),
      ''
    ]);
  });

  posixIt('writes only to a regular file of this user that has no other links', () => {
    const target: string = path.join(folder, 'target.log');
    fs.writeFileSync(target, 'kept\n');
    fs.symlinkSync(target, logFilePath);
    logReclaimedDaemon(paths, 106);
    expect(fs.readFileSync(target, 'utf8')).toBe('kept\n');
    expect(findReclaimedDaemonPid(paths)).toBeUndefined();
    fs.unlinkSync(logFilePath);
    fs.linkSync(target, logFilePath);
    logReclaimedDaemon(paths, 106);
    expect(fs.readFileSync(target, 'utf8')).toBe('kept\n');
    fs.unlinkSync(logFilePath);
    // As the launcher does, it makes the log private.
    fs.writeFileSync(logFilePath, '');
    fs.chmodSync(logFilePath, 0o644);
    logReclaimedDaemon(paths, 106);
    expect(fs.statSync(logFilePath).mode % 0o1000).toBe(0o600);
    expect(findReclaimedDaemonPid(paths)).toBe(106);
    // Also a log that it may only write, which the launcher opens too.
    fs.chmodSync(logFilePath, 0o200);
    logReclaimedDaemon(paths, 110);
    expect(fs.statSync(logFilePath).mode % 0o1000).toBe(0o600);
    expect(findReclaimedDaemonPid(paths)).toBe(110);
  });

  // For example, Rush that runs in-process after the client reclaimed a daemon. Jest resolves modules itself, so
  // a Node process of its own runs the function and then requires a package the way Node does.
  posixIt.each([logReclaimedDaemon.name, findReclaimedDaemonPid.name])(
    'leaves require() resolving symlinks after %s met a log that is a FIFO',
    (functionName: string) => {
      // As pnpm installs them: the package finds its dependency only from its real path.
      const store: string = path.join(folder, 'store', 'node_modules');
      fs.mkdirSync(path.join(store, 'reclaim-log-dependency'), { recursive: true });
      fs.writeFileSync(path.join(store, 'reclaim-log-dependency', 'index.js'), "module.exports = 'found';");
      fs.mkdirSync(path.join(store, 'reclaim-log-package'));
      fs.writeFileSync(
        path.join(store, 'reclaim-log-package', 'index.js'),
        "module.exports = require('reclaim-log-dependency');"
      );
      fs.mkdirSync(path.join(folder, 'app', 'node_modules'), { recursive: true });
      fs.symlinkSync(
        path.join(store, 'reclaim-log-package'),
        path.join(folder, 'app', 'node_modules', 'reclaim-log-package')
      );
      fs.writeFileSync(
        path.join(folder, 'main.js'),
        'const [modulePath, pathsJson, functionName] = process.argv.slice(2);\n' +
          'require(modulePath)[functionName](JSON.parse(pathsJson), 111);\n' +
          "try { process.stdout.write(require('./app/node_modules/reclaim-log-package')); }\n" +
          'catch (error) { process.stdout.write(error.code); }\n'
      );
      expect(spawnSync('mkfifo', ['-m', '600', logFilePath]).status).toBe(0);
      const child: SpawnSyncReturns<string> = spawnSync(
        process.execPath,
        [
          path.join(folder, 'main.js'),
          require.resolve('../ReclaimedDaemonLog'),
          JSON.stringify(paths),
          functionName
        ],
        {
          cwd: folder,
          encoding: 'utf8',
          env: { ...process.env, NODE_OPTIONS: undefined, NODE_PRESERVE_SYMLINKS: undefined },
          timeout: 10000
        }
      );
      expect({ status: child.status, stdout: child.stdout, stderr: child.stderr }).toEqual({
        status: 0,
        stdout: 'found',
        stderr: ''
      });
    }
  );

  it('is cleared by a reset of the daemon files', async () => {
    logReclaimedDaemon(paths, 107);
    expect(await resetDaemonArtifactsAsync(paths)).toEqual({ removedPaths: [] });
    expect(findReclaimedDaemonPid(paths)).toBeUndefined();
    expect(readLogLines()).toEqual([
      expect.stringMatching(getReclaimLine(107)),
      expect.stringMatching(
        new RegExp(
          `^\\S+Z rush-client \\(PID ${process.pid}\\): reset the daemon's files; the report that rushd ` +
            '\\(PID 107\\) exited without shutting down is cleared\\.$'
        )
      ),
      ''
    ]);
    // Without a report, a reset adds nothing.
    await resetDaemonArtifactsAsync(paths);
    expect(readLogLines()).toHaveLength(3);
    logReclaimedDaemon(paths, 108);
    expect(findReclaimedDaemonPid(paths)).toBe(108);
  });
});
