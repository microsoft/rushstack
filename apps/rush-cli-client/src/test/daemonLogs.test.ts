// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { Rush } from '@microsoft/rush-lib';
import { getDaemonLogFilePath } from '@rushstack/rush-client-core';
import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { getDaemonConnectionOptions } from '../daemonConnectionOptions';
import { printDaemonLogAsync } from '../daemonLogs';

async function waitUntilAsync(predicate: () => boolean): Promise<void> {
  const deadline: number = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for log output.');
    await delayAsync(10);
  }
}

describe('daemon launcher log following', () => {
  let folder: string;
  let paths: IDaemonPaths;
  let filename: string;
  let abort: AbortController;
  let running: Promise<void> | undefined;
  let chunks: Buffer[];
  let output: Writable;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-log-follow-'));
    fs.writeFileSync(
      path.join(folder, 'rush.json'),
      JSON.stringify({
        rushVersion: Rush.version,
        npmVersion: '10.0.0',
        projects: []
      })
    );
    paths = getDaemonConnectionOptions(folder, Rush.version, process.env, false).paths;
    filename = getDaemonLogFilePath(paths);
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    fs.writeFileSync(filename, '', { mode: 0o600, flag: 'wx' });
    abort = new AbortController();
    running = undefined;
    chunks = [];
    output = new Writable({
      write: (chunk: Buffer, encoding, callback) => {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    });
  });

  afterEach(async () => {
    abort.abort(new Error('Log fixture cleanup.'));
    await Promise.allSettled([running]);
    output.destroy();
    fs.rmSync(filename, { force: true });
    fs.rmSync(`${filename}.previous`, { force: true });
    fs.rmSync(folder, { recursive: true });
  });

  it('follows appends after EOF in bounded byte-preserving chunks without creating daemon ownership', async () => {
    running = printDaemonLogAsync(paths, { follow: true, abortSignal: abort.signal, output });
    await delayAsync(150);
    const bytes: Buffer = Buffer.alloc(3 * 64 * 1024 + 17);
    for (let index: number = 0; index < bytes.length; index++) bytes[index] = index % 256;
    fs.appendFileSync(filename, bytes);
    await waitUntilAsync(() => chunks.reduce((size, chunk) => size + chunk.length, 0) === bytes.length);
    fs.appendFileSync(filename, 'later\n');
    await waitUntilAsync(() => Buffer.concat(chunks).subarray(-6).toString() === 'later\n');
    abort.abort(new Error('Finished following.'));
    await running;
    expect(Buffer.concat(chunks)).toEqual(Buffer.concat([bytes, Buffer.from('later\n')]));
    expect(chunks.every((chunk) => chunk.length <= 64 * 1024)).toBe(true);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    expect(fs.existsSync(paths.socketPath)).toBe(false);
  });

  it('keeps the default snapshot finite', async () => {
    fs.writeFileSync(filename, 'snapshot\n');
    await printDaemonLogAsync(paths, { output });
    fs.appendFileSync(filename, 'not-in-snapshot\n');
    expect(Buffer.concat(chunks).toString()).toBe('snapshot\n');
  });

  it('honors backpressure and cancels a stalled output without reading unbounded chunks', async () => {
    fs.writeFileSync(filename, Buffer.alloc(4 * 64 * 1024));
    let release: () => void = () => {};
    let writes: number = 0;
    output = new Writable({
      highWaterMark: 1,
      write: (chunk: Buffer, encoding, callback) => {
        writes++;
        expect(chunk.length).toBeLessThanOrEqual(64 * 1024);
        release = callback;
      }
    });
    running = printDaemonLogAsync(paths, { follow: true, abortSignal: abort.signal, output });
    try {
      await waitUntilAsync(() => writes === 1);
      await delayAsync(150);
      expect(writes).toBe(1);
      abort.abort(new Error('Cancel blocked output.'));
      await running;
      expect(output.destroyed).toBe(true);
    } finally {
      release();
    }
  });

  it.each(['truncate', 'replace'])(
    'fails explicitly when the followed file is changed by %s',
    async (mode) => {
      fs.writeFileSync(filename, 'initial\n');
      running = printDaemonLogAsync(paths, { follow: true, abortSignal: abort.signal, output });
      const failed = expect(running).rejects.toThrow(mode === 'truncate' ? 'truncated' : 'replaced');
      await waitUntilAsync(() => chunks.length > 0);
      if (mode === 'truncate') fs.truncateSync(filename);
      else {
        fs.renameSync(filename, `${filename}.previous`);
        fs.writeFileSync(filename, 'replacement\n');
      }
      await failed;
    }
  );

  it('does not hide an output failure', async () => {
    fs.writeFileSync(filename, 'output\n');
    output = new Writable({
      write: (chunk, encoding, callback) => callback(new Error('log destination failed'))
    });
    await expect(
      printDaemonLogAsync(paths, { follow: true, abortSignal: abort.signal, output })
    ).rejects.toThrow('log destination failed');
  });

  it.each([false, true])(
    'cancels the actual follow CLI with exit 130 (stalled stdout: %s)',
    async (stalled) => {
      fs.writeFileSync(filename, stalled ? Buffer.alloc(10 * 1024 * 1024) : 'initial\n');
      const windowsSignal: boolean = process.platform === 'win32';
      const child: ChildProcess = spawn(
        process.execPath,
        [
          windowsSignal
            ? path.join(__dirname, 'CliSignalTestProcess.js')
            : path.resolve(__dirname, '../../bin/rush-client'),
          'daemon',
          'logs',
          '--follow'
        ],
        {
          cwd: folder,
          env: { ...process.env, RUSH_DAEMON: '1' },
          stdio: windowsSignal ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe']
        }
      );
      const closed: Promise<unknown[]> = once(child, 'close');
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let stdout: string = '';
      let stderr: string = '';
      child.stderr!.on('data', (bytes: Buffer) => {
        stderr += bytes.toString();
      });
      try {
        if (stalled) {
          await once(child.stdout!, 'readable');
          await delayAsync(150);
        } else {
          child.stdout!.on('data', (bytes: Buffer) => {
            stdout += bytes.toString();
          });
          await waitUntilAsync(() => stdout === 'initial\n');
          fs.appendFileSync(filename, 'appended\n');
          await waitUntilAsync(() => stdout === 'initial\nappended\n');
        }
        timeout = setTimeout(() => child.kill('SIGKILL'), 3000);
        if (windowsSignal) child.send!('SIGINT');
        else child.kill('SIGINT');
        expect((await closed)[0]).toBe(130);
        expect(stderr).toBe('');
        expect(fs.existsSync(paths.lockfilePath)).toBe(false);
        expect(fs.existsSync(paths.socketPath)).toBe(false);
      } finally {
        clearTimeout(timeout);
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await closed;
      }
    },
    15000
  );
});
