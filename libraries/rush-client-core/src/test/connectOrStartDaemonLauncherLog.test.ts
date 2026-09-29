// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from '../connectOrStartDaemon';
import { getDaemonLogFilePath } from '../DaemonLogFile';
import { runThenRequireSymlinkedPackage, type IRequireAfterScriptResult } from './SymlinkedPackageRequire';
import { removeTestFolderAsync } from './TestProcessExit';

describe('detached daemon startup with a launcher log that it cannot use', () => {
  let folder: string;
  let paths: IDaemonPaths;
  let startedFilePath: string;
  let options: IConnectOrStartDaemonOptions;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-launcher-log-'));
    paths = {
      runtimeDir: folder,
      socketPath: path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
    startedFilePath = path.join(folder, 'started');
    options = {
      paths,
      expectedDaemonVersion: 'fixture',
      startupTimeoutMs: 7000,
      // A daemon that it started would leave this file.
      startCommand: {
        command: process.execPath,
        args: ['-e', "require('node:fs').writeFileSync(process.argv[1], '')", startedFilePath],
        cwd: folder,
        environment: {}
      }
    };
  });

  afterEach(async () => {
    await removeTestFolderAsync(folder);
  });

  // For example, a file that the user put there. A caller then runs Rush in-process and prints the reason, as it
  // does for a log that opens but is not a regular, unshared file.
  const unopenableLogs: [string, string, (logFilePath: string) => void][] = [
    ['a symlink', 'ELOOP', (logFilePath: string) => fs.symlinkSync(`${logFilePath}.target`, logFilePath)],
    [
      'a FIFO without a reader',
      'ENXIO',
      (logFilePath: string) => expect(spawnSync('mkfifo', ['-m', '600', logFilePath]).status).toBe(0)
    ],
    ['a directory', 'EISDIR', (logFilePath: string) => fs.mkdirSync(logFilePath)]
  ];
  // Root may write to any file.
  if (process.getuid?.() !== 0) {
    unopenableLogs.push([
      'a file that this user may not write to',
      'EACCES',
      (logFilePath: string) => fs.writeFileSync(logFilePath, 'unchanged', { mode: 0o444 })
    ]);
  }
  (process.platform === 'win32' ? it.skip : it).each(unopenableLogs)(
    'reports a launcher log that is %s and cannot be opened (%s), and starts nothing',
    async (kind: string, code: string, createLog: (logFilePath: string) => void) => {
      const logFilePath: string = getDaemonLogFilePath(paths);
      createLog(logFilePath);
      const entries: string[] = fs.readdirSync(folder);
      const { ino, mode, size, mtimeMs } = fs.lstatSync(logFilePath);
      await expect(connectOrStartDaemonAsync(options)).rejects.toMatchObject({
        code: 'startupFailed',
        message: `Launcher log cannot be opened for writing (${code}): ${logFilePath}`,
        cause: expect.objectContaining({ code })
      });
      // No helper, reservation, symlink target or lock file was left behind, and the log is as it was.
      expect(fs.readdirSync(folder)).toEqual(entries);
      expect(fs.lstatSync(logFilePath)).toMatchObject({ ino, mode, size, mtimeMs });
    }
  );

  // For example, Rush that runs in-process after the client refused a log that is a FIFO, which another process
  // reads. Jest resolves modules itself, so a Node process of its own makes the call.
  (process.platform === 'win32' ? it.skip : it)(
    'leaves require() resolving symlinks after it refused a launcher log that is a FIFO',
    () => {
      const logFilePath: string = getDaemonLogFilePath(paths);
      expect(spawnSync('mkfifo', ['-m', '600', logFilePath]).status).toBe(0);
      const result: IRequireAfterScriptResult = runThenRequireSymlinkedPackage(
        folder,
        [
          'const [modulePath, optionsJson, logFilePath] = args;',
          "const fs = require('node:fs');",
          '// With a reader, the client can open the FIFO for writing.',
          'fs.openSync(logFilePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);',
          'const { connectOrStartDaemonAsync } = require(modulePath);',
          'await connectOrStartDaemonAsync(JSON.parse(optionsJson)).catch((error) => {',
          '  process.stdout.write(`${error.message}\\n`);',
          '});'
        ].join('\n'),
        [require.resolve('../connectOrStartDaemon'), JSON.stringify(options), logFilePath]
      );
      expect(result).toEqual({
        status: 0,
        stdout: `Launcher log must be a regular, unshared file: ${logFilePath}\nfound`,
        stderr: ''
      });
      expect(fs.existsSync(startedFilePath)).toBe(false);
    }
  );
});
