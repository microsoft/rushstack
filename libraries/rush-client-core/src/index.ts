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
  type IDaemonClientExecuteOptions
} from './DaemonClient';
export { DaemonClientError, type DaemonClientErrorCode } from './DaemonClientError';
export { getDaemonLogFilePath } from './DaemonLogFile';
export {
  connectOrStartDaemonAsync,
  requestDaemonShutdownAsync,
  type IConnectOrStartDaemonOptions,
  type IDaemonStartCommand
} from './connectOrStartDaemon';
