// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { connectOrStartDaemonAsync } from '../connectOrStartDaemon';
import { removeTestFolderAsync } from './TestProcessExit';

const windowsIt: typeof it = process.platform === 'win32' ? it : it.skip;

windowsIt.each([false, true])(
  'never treats a sharing-denied ownership record as released (persistent denial: %s)',
  async (persistent) => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-owner-read-'));
    const paths: IDaemonPaths = {
      lockfilePath: path.join(folder, 'daemon.pid.json'),
      socketPath: `\\\\.\\pipe\\${path.basename(folder)}`
    };
    const previousDaemon = { pid: process.pid, startedAt: new Date().toISOString() };
    const original: string = JSON.stringify(previousDaemon);
    fs.writeFileSync(paths.lockfilePath, original);
    const holder: ChildProcessWithoutNullStreams = spawn(
      path.join(process.env.SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$s=[IO.File]::Open($env:RUSHD_TEST_OWNER,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); [Console]::WriteLine("held"); [Console]::ReadLine() | Out-Null; $s.Dispose();'
      ],
      { env: { ...process.env, RUSHD_TEST_OWNER: paths.lockfilePath }, stdio: 'pipe' }
    );
    const closed: Promise<unknown[]> = once(holder, 'close');
    let stderr: string = '';
    holder.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    let failure: unknown;
    let settled: boolean = false;
    let waiting: Promise<void> | undefined;
    try {
      await Promise.race([
        once(holder.stdout, 'data'),
        closed.then(() => {
          throw new Error(`Ownership holder exited before locking: ${stderr}`);
        })
      ]);
      waiting = connectOrStartDaemonAsync({
        paths,
        previousDaemon,
        startupTimeoutMs: persistent ? 100 : 1000
      }).then(
        async (client) => {
          await client.closeAsync();
          settled = true;
        },
        (error: unknown) => {
          failure = error;
          settled = true;
        }
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      if (persistent) {
        await waiting;
        expect(failure).toMatchObject({ message: expect.stringContaining('Cannot safely read') });
        await expect(removeTestFolderAsync(folder)).rejects.toMatchObject({
          code: expect.stringMatching(/^(EPERM|EBUSY)$/)
        });
      }
      holder.stdin.end('release\n');
      await closed;
      expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe(original);
      if (!persistent) {
        fs.unlinkSync(paths.lockfilePath);
        await waiting;
        expect(failure).toMatchObject({ message: expect.stringContaining('auto-start is disabled') });
      }
    } finally {
      if (holder.exitCode === null && holder.signalCode === null) holder.stdin.end('release\n');
      await closed;
      await waiting;
      await removeTestFolderAsync(folder);
    }
  }
);
