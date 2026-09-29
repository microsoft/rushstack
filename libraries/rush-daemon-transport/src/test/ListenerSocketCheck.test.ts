// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as net from 'node:net';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { DaemonFrameListener } from '../DaemonListener';
import { DaemonListenerLifetime } from '../DaemonListenerLifetime';
import type { IDaemonPaths } from '../DaemonPaths';

import { createIsolatedTestDaemonPaths, removeIsolatedBase } from './TestDaemonFixture';

// A named pipe has no file identity, and it can't be deleted while its server runs.
const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
const REPLACEMENT: string = 'another file';
const UTF8: BufferEncoding = 'utf8';

let paths: IDaemonPaths;
let listener: DaemonFrameListener;

beforeEach(async () => {
  paths = createIsolatedTestDaemonPaths();
  listener = await DaemonFrameListener.listenAsync(paths, {
    onConnection: () => undefined,
    protocolVersion: DAEMON_PROTOCOL_VERSION
  });
});

afterEach(async () => {
  await listener.closeAsync();
  removeIsolatedBase(paths);
});

it('reports no change while the socket has its name', () => {
  expect(listener.checkSocket()).toBeUndefined();
});

it('reports no change for a listener that published no socket, as on Windows', () => {
  expect(new DaemonListenerLifetime(net.createServer(), paths, {}).checkSocket()).toBeUndefined();
});

posixIt('reports a deleted socket as removed', () => {
  fs.rmSync(paths.socketPath);
  expect(listener.checkSocket()).toBe('removed');
});

posixIt('reports a socket whose runtime folder was deleted as removed', () => {
  fs.rmSync(paths.runtimeDir ?? paths.socketPath, { recursive: true });
  expect(listener.checkSocket()).toBe('removed');
});

posixIt(
  'reports a socket name that another file took as replaced, and closes without deleting it',
  async () => {
    fs.rmSync(paths.socketPath);
    fs.writeFileSync(paths.socketPath, REPLACEMENT);
    expect(listener.checkSocket()).toBe('replaced');
    await listener.closeAsync();
    expect(fs.readFileSync(paths.socketPath, UTF8)).toBe(REPLACEMENT);
  }
);

posixIt('reports no change once the listener stopped accepting and deleted its socket', async () => {
  await listener.stopAcceptingAsync();
  expect(fs.existsSync(paths.socketPath)).toBe(false);
  expect(listener.checkSocket()).toBeUndefined();
});

posixIt('reports no change once the listener released its socket for exit', () => {
  expect(listener.releaseForExit()).toBe(true);
  expect(fs.existsSync(paths.socketPath)).toBe(false);
  expect(listener.checkSocket()).toBeUndefined();
});
