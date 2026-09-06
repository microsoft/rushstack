// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { connectDaemonAsync } from '../DaemonConnector';
import { DaemonFrameListener } from '../DaemonListener';
import * as daemonLockfile from '../DaemonLockfile';
import type { IDaemonPaths } from '../DaemonPaths';
import { DaemonTransportErrorCode } from '../DaemonTransportError';

import { createTestDaemonPaths } from './TestDaemonFixture';

const FAILURE_MESSAGE: string = 'Unable to write daemon ownership';

it('closes its bound endpoint when publishing ownership fails', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const writeLockfile: jest.SpyInstance = jest.spyOn(daemonLockfile, 'writeDaemonLockfile');
  writeLockfile.mockImplementationOnce(() => { throw new Error(FAILURE_MESSAGE); });
  try {
    await expect(DaemonFrameListener.listenAsync(paths, {
      onConnection: () => undefined,
      protocolVersion: DAEMON_PROTOCOL_VERSION
    })).rejects.toThrow(FAILURE_MESSAGE);
    await expect(connectDaemonAsync(paths.socketPath)).rejects.toMatchObject({
      code: DaemonTransportErrorCode.connectionRefused
    });
    expect(daemonLockfile.readDaemonLockfile(paths.lockfilePath)).toBeUndefined();
  } finally {
    writeLockfile.mockRestore();
  }
});
