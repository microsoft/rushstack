// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { DaemonFrameListener } from '../DaemonListener';
import { readDaemonLockfile } from '../DaemonLockfile';
import type { IDaemonPaths } from '../DaemonPaths';
import { DaemonTransportErrorCode } from '../DaemonTransportError';

import { createTestDaemonPaths } from './TestDaemonFixture';

function listenAsync(paths: IDaemonPaths): Promise<DaemonFrameListener> {
  return DaemonFrameListener.listenAsync(paths, {
    onConnection: () => undefined,
    protocolVersion: DAEMON_PROTOCOL_VERSION
  });
}

it('retains ownership after stopping until close explicitly releases it', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const listener: DaemonFrameListener = await listenAsync(paths);
  try {
    await listener.stopAcceptingAsync();
    expect(readDaemonLockfile(paths.lockfilePath)?.pid).toBe(process.pid);
    await expect(listenAsync(paths)).rejects.toMatchObject({
      code: DaemonTransportErrorCode.daemonAlreadyRunning
    });
  } finally {
    await listener.closeAsync();
  }
  expect(readDaemonLockfile(paths.lockfilePath)).toBeUndefined();
});

it('does not remove a successor endpoint when the old listener closes twice', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const original: DaemonFrameListener = await listenAsync(paths);
  await original.closeAsync();
  const successor: DaemonFrameListener = await listenAsync(paths);
  try {
    await original.closeAsync();
    expect(readDaemonLockfile(paths.lockfilePath)?.pid).toBe(process.pid);
    await expect(listenAsync(paths)).rejects.toMatchObject({
      code: DaemonTransportErrorCode.daemonAlreadyRunning
    });
  } finally {
    await successor.closeAsync();
  }
});
