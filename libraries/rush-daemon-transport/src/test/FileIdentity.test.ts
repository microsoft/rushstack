// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import type { IDaemonFileIdentity } from '../DaemonFileIdentity';
import { pinFileIdentity, readFileIdentity, removeOwnFile } from '../DaemonFileIdentity';
import { DaemonFrameListener } from '../DaemonListener';
import type { IDaemonPaths } from '../DaemonPaths';

import { createIsolatedTestDaemonPaths, removeIsolatedBase } from './TestDaemonFixture';

const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
const UTF8: BufferEncoding = 'utf8';
const SOCKET_MODE: number = 0o600;
const PERMISSION_MODULUS: number = 0o1000;
const PRIVATE_NAME_PREFIX: string = '.bind-';
const REPLACEMENT: string = 'another file';
const MOVED_SUFFIX: string = '.moved';

function createFile(paths: IDaemonPaths, content: string): string {
  const filePath: string = path.join(paths.runtimeDir ?? '', 'file');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

posixIt('keeps a pinned inode in use, so a replacement never passes for the file it replaced', () => {
  const paths: IDaemonPaths = createIsolatedTestDaemonPaths();
  const filePath: string = createFile(paths, 'first');
  const pinned: IDaemonFileIdentity = pinFileIdentity(filePath);
  fs.rmSync(filePath);
  fs.writeFileSync(filePath, 'second');
  expect(readFileIdentity(filePath)?.ino).not.toBe(pinned.ino);
  removeOwnFile(filePath, pinned);
  expect(fs.readFileSync(filePath, UTF8)).toBe('second');
  expect(() => fs.fstatSync(pinned.fd ?? Number.NaN)).toThrow();
  removeIsolatedBase(paths);
});

posixIt('removes a file that is still the pinned one', () => {
  const paths: IDaemonPaths = createIsolatedTestDaemonPaths();
  const filePath: string = createFile(paths, 'only');
  removeOwnFile(filePath, pinFileIdentity(filePath));
  expect(fs.existsSync(filePath)).toBe(false);
  removeIsolatedBase(paths);
});

posixIt('reads nothing at a path whose folder became a file, and still releases the pinned inode', () => {
  const paths: IDaemonPaths = createIsolatedTestDaemonPaths();
  const filePath: string = createFile(paths, 'only');
  const pinned: IDaemonFileIdentity = pinFileIdentity(filePath);
  fs.rmSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(path.dirname(filePath), REPLACEMENT);
  expect(readFileIdentity(filePath)).toBeUndefined();
  removeOwnFile(filePath, pinned);
  expect(fs.readFileSync(path.dirname(filePath), UTF8)).toBe(REPLACEMENT);
  expect(() => fs.fstatSync(pinned.fd ?? Number.NaN)).toThrow();
  removeIsolatedBase(paths);
});

posixIt('releases the pinned inode when it cannot read the path, and throws why', () => {
  const paths: IDaemonPaths = createIsolatedTestDaemonPaths();
  const filePath: string = createFile(paths, 'only');
  const pinned: IDaemonFileIdentity = pinFileIdentity(filePath);
  const folder: string = path.dirname(filePath);
  // A folder that became a link to itself: every path through it fails with ELOOP.
  fs.renameSync(folder, `${folder}${MOVED_SUFFIX}`);
  fs.symlinkSync(folder, folder);
  expect(() => removeOwnFile(filePath, pinned)).toThrow('ELOOP');
  expect(() => fs.fstatSync(pinned.fd ?? Number.NaN)).toThrow();
  expect(fs.readFileSync(path.join(`${folder}${MOVED_SUFFIX}`, 'file'), UTF8)).toBe('only');
  removeIsolatedBase(paths);
});

posixIt('publishes an owner-only socket and deletes the private name it bound', async () => {
  const paths: IDaemonPaths = createIsolatedTestDaemonPaths();
  const listener: DaemonFrameListener = await DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: () => undefined
  });
  try {
    expect(fs.lstatSync(paths.socketPath).isSocket()).toBe(true);
    expect(fs.lstatSync(paths.socketPath).mode % PERMISSION_MODULUS).toBe(SOCKET_MODE);
    const names: string[] = fs.readdirSync(paths.runtimeDir ?? '');
    expect(names.filter((name: string) => name.startsWith(PRIVATE_NAME_PREFIX))).toEqual([]);
  } finally {
    await listener.closeAsync();
    removeIsolatedBase(paths);
  }
});
