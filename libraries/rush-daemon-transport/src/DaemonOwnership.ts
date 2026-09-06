// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonProcessAlive, readDaemonLockfile } from './DaemonLockfile';
import type { IDaemonLockfile } from './DaemonLockfile';
import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

export function assertDaemonOwnershipAvailable(lockfilePath: string): void {
  const owner: IDaemonLockfile | undefined = readDaemonLockfile(lockfilePath);
  if (owner && isDaemonProcessAlive(owner.pid)) {
    throw new DaemonTransportError(
      DaemonTransportErrorCode.daemonAlreadyRunning,
      `Daemon process ${owner.pid} still owns ${lockfilePath}; wait for shutdown cleanup to finish.`
    );
  }
}
