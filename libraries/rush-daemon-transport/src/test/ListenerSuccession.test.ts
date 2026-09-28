// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { connectDaemonAsync } from '../DaemonConnector';
import type { DaemonFrameConnection } from '../DaemonFrameConnection';
import { DaemonFrameListener } from '../DaemonListener';
import { readDaemonLockfile } from '../DaemonLockfile';
import type { IDaemonPaths } from '../DaemonPaths';

import { createDeferred, createIsolatedTestDaemonPaths, removeIsolatedBase } from './TestDaemonFixture';
import type { IDeferred } from './TestDaemonFixture';

// A named pipe can't be deleted while its server runs, so only POSIX has a successor in this sense.
const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
const SUCCESSOR: string = 'successor';

function listenAsync(paths: IDaemonPaths, reached?: IDeferred<string>): Promise<DaemonFrameListener> {
  return DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: () => reached?.resolve(SUCCESSOR)
  });
}

async function expectSuccessorReachableAsync(paths: IDaemonPaths, reached: IDeferred<string>): Promise<void> {
  expect(readDaemonLockfile(paths.lockfilePath)?.socketPath).toBe(paths.socketPath);
  const client: DaemonFrameConnection = await connectDaemonAsync(paths.socketPath);
  await expect(reached.promise).resolves.toBe(SUCCESSOR);
  await client.closeAsync();
}

async function expectPredecessorCloseSparesSuccessorAsync(
  deleteFiles: (paths: IDaemonPaths) => void
): Promise<void> {
  const paths: IDaemonPaths = createIsolatedTestDaemonPaths();
  const predecessor: DaemonFrameListener = await listenAsync(paths);
  deleteFiles(paths);
  const reached: IDeferred<string> = createDeferred<string>();
  const successor: DaemonFrameListener = await listenAsync(paths, reached);
  try {
    await predecessor.closeAsync();
    await expectSuccessorReachableAsync(paths, reached);
  } finally {
    await successor.closeAsync();
    removeIsolatedBase(paths);
  }
}

posixIt('keeps a successor reachable after a predecessor whose socket and lockfile were deleted closes', () =>
  expectPredecessorCloseSparesSuccessorAsync((paths: IDaemonPaths) => {
    fs.rmSync(paths.socketPath);
    fs.rmSync(paths.lockfilePath);
  })
);

posixIt('keeps a successor reachable after a predecessor whose runtime folder was deleted closes', () =>
  expectPredecessorCloseSparesSuccessorAsync((paths: IDaemonPaths) => {
    fs.rmSync(paths.runtimeDir ?? paths.socketPath, { recursive: true });
  })
);

posixIt('removes its own socket and lockfile when it closes', async () => {
  const paths: IDaemonPaths = createIsolatedTestDaemonPaths();
  const listener: DaemonFrameListener = await listenAsync(paths);
  await listener.closeAsync();
  expect(fs.readdirSync(paths.runtimeDir ?? paths.socketPath)).toEqual([]);
  removeIsolatedBase(paths);
});
