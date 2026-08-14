// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Workspace-keyed socket/pipe transport for the Rush daemon (`rushd`):
 * workspace-key hashing, per-user runtime-dir path derivation, a `net`
 * listener/connector, and PID/lockfile handling with stale-socket reclaim.
 *
 * @remarks
 * Frames are encoded with `@rushstack/rush-daemon-protocol`; this package owns
 * where the bytes live and how endpoints find each other. It has no `rush-lib`
 * dependency.
 *
 * @packageDocumentation
 */

export { connectDaemonAsync, type IDaemonConnectorOptions } from './DaemonConnector';
export { DaemonFrameConnection } from './DaemonFrameConnection';
export { DaemonFrameListener, type IDaemonListenerOptions } from './DaemonListener';
export {
  ensureDaemonRuntimeDir,
  isDaemonProcessAlive,
  readDaemonLockfile,
  removeDaemonArtifacts,
  writeDaemonLockfile,
  type IDaemonLockfile
} from './DaemonLockfile';
export { tryAcquireReclaimLock, type DaemonReclaimLockOutcome } from './DaemonReclaimLock';
export { resolveDaemonPaths, type IDaemonPathEnvironment, type IDaemonPaths } from './DaemonPaths';
export { resolveDaemonPathsFromProcess } from './DaemonPathsFromProcess';
export { reclaimStaleDaemonAsync } from './DaemonReclaim';
export { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';
export {
  computeDaemonWorkspaceKey,
  WORKSPACE_KEY_LENGTH,
  type IWorkspaceKeyInput
} from './WorkspaceKey';
