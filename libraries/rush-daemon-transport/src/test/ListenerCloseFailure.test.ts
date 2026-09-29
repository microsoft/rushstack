// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as net from 'node:net';

import type { IDaemonFileIdentity } from '../DaemonFileIdentity';
import { pinFileIdentity } from '../DaemonFileIdentity';
import { DaemonListenerLifetime } from '../DaemonListenerLifetime';
import type { IDaemonPaths } from '../DaemonPaths';
import { ensureDaemonRuntimeDir } from '../DaemonRuntimeDir';
import { listenPublishedAsync } from '../DaemonSocketPublication';

import { createIsolatedTestDaemonPaths, removeIsolatedBase } from './TestDaemonFixture';

// A named pipe has no runtime folder that could be replaced.
const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
const REPLACEMENT: string = 'another file';
const LOCKFILE_CONTENT: string = '{}';
const MOVED_SUFFIX: string = '.moved';
const UTF8: BufferEncoding = 'utf8';
const ONCE: number = 1;
const ELOOP: string = 'ELOOP';

let paths: IDaemonPaths;
let server: net.Server;
let lockfile: IDaemonFileIdentity;
let stopRecording: jest.Mock;
let lifetime: DaemonListenerLifetime;

beforeEach(async () => {
  paths = createIsolatedTestDaemonPaths();
  ensureDaemonRuntimeDir(paths);
  server = net.createServer();
  const socket: IDaemonFileIdentity = await listenPublishedAsync(server, paths, {});
  fs.writeFileSync(paths.lockfilePath, LOCKFILE_CONTENT);
  lockfile = pinFileIdentity(paths.lockfilePath);
  stopRecording = jest.fn();
  lifetime = new DaemonListenerLifetime(server, paths, { socket, lockfile }, stopRecording);
});

afterEach(() => {
  // Only after a failed test: the listener closes its server itself.
  if (server.listening) server.close();
  removeIsolatedBase(paths);
});

/**
 * Deletes the socket with no stat of it (`fs.rmSync` would stat it first). After a sync stat of a socket, Node 22's
 * `fs.realpathSync` can return a path with a link unresolved (it checks a stale stat), and jest then fails to load
 * its own modules.
 */
function unlinkSocket(): void {
  fs.unlinkSync(paths.socketPath);
}

function expectClosedAndReleased(): void {
  expect(server.listening).toBe(false);
  expect(stopRecording).toHaveBeenCalledTimes(ONCE);
  expect(() => fs.fstatSync(lockfile.fd ?? Number.NaN)).toThrow();
}

posixIt(
  'closes and releases everything, without an error, after a file took its runtime folder',
  async () => {
    const folder: string = paths.runtimeDir ?? '';
    unlinkSocket();
    fs.rmSync(folder, { recursive: true });
    fs.writeFileSync(folder, REPLACEMENT);
    await lifetime.closeAsync();
    expectClosedAndReleased();
    expect(fs.readFileSync(folder, UTF8)).toBe(REPLACEMENT);
  }
);

posixIt('closes and releases everything when it cannot delete its files, and rejects with why', async () => {
  const folder: string = paths.runtimeDir ?? '';
  unlinkSocket();
  // A runtime folder that became a link to itself: every path through it fails with ELOOP.
  fs.renameSync(folder, `${folder}${MOVED_SUFFIX}`);
  fs.symlinkSync(folder, folder);
  const closing: Promise<void> = lifetime.closeAsync();
  // Both errors, the socket's first: the lockfile's does not replace it.
  await expect(closing).rejects.toMatchObject({
    errors: [expect.objectContaining({ code: ELOOP }), expect.objectContaining({ code: ELOOP })]
  });
  await expect(closing).rejects.toThrow(`'${paths.socketPath}'. Then: `);
  await expect(closing).rejects.toThrow(`'${paths.lockfilePath}'`);
  expectClosedAndReleased();
});
