// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Opt-in Rush daemon client transport, immutable requests, and detached startup.
 * This package does not depend on rush-lib or construct an operation graph.
 * @packageDocumentation
 */
export { captureDaemonRequest, type ICaptureDaemonRequestOptions } from './captureDaemonRequest';
export {
  DaemonClient,
  type DaemonClientOutcome,
  type IDaemonClientConnectOptions,
  type IDaemonClientExecuteOptions,
  type IDaemonClientLivenessOptions,
  type IDaemonRestartWaitDetails,
  type IDaemonSilence
} from './DaemonClient';
export { formatDaemonRestartCause, type DaemonRestartRequester } from './DaemonRestartCause';
export { DaemonClientError, type DaemonClientErrorCode } from './DaemonClientError';
export { getDaemonLogFilePath } from './DaemonLogFile';
export { findReclaimedDaemonPid } from './ReclaimedDaemonLog';
export {
  describeLiveDaemonOwner,
  resetDaemonArtifactsAsync,
  type IDaemonArtifactResetOptions,
  type IDaemonArtifactResetResult
} from './DaemonOwnership';
export type { DaemonOwnerHintPurpose } from './DaemonOwnerDiagnosis';
export { assertDaemonRuntimeFolderIsPrivate } from './DaemonRuntimeFolder';
export {
  inspectDaemonStartupReservation,
  type DaemonStartupHelperState,
  type IDaemonStartupReservationInfo
} from './DaemonStartupReservation';
export { reclaimCrashedDaemonAsync } from './ExitedDaemonReclaim';
export {
  DaemonRestartFailedError,
  executeWithDaemonRestartAsync,
  type IDaemonRestartNotice,
  type IExecuteWithDaemonRestartOptions
} from './executeWithDaemonRestart';
export {
  connectOrAwaitDaemonStartupAsync,
  connectToStartingDaemonAsync,
  DaemonStartupPendingError,
  type IConnectOrAwaitDaemonStartupOptions
} from './connectOrAwaitDaemonStartup';
export {
  connectOrStartDaemonAsync,
  requestDaemonShutdownAsync,
  resolveDaemonStartupReservationAsync,
  type IConnectOrStartDaemonOptions,
  type IDaemonStartCommand
} from './connectOrStartDaemon';
export { findNativeLockHolder, formatNativeLockHolder } from './NativeLockHolder';
