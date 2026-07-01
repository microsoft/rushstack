// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export { RushdDaemon, type IRushdDaemonOptions } from './RushdDaemon';
export { RushdClient, type IRushdClientOptions } from './RushdClient';
export {
  type ClientMessage,
  type DaemonMessage,
  type IBuildRequest,
  type ICancelRequest,
  type IDaemonStatusResponse,
  type IErrorMessage,
  type IOperationStatusMessage,
  type IOutputMessage,
  type IPingRequest,
  type IPongResponse,
  type IResultMessage,
  type IShutdownRequest,
  type IStatusRequest,
  RUSHD_PROTOCOL_VERSION,
  serializeMessage,
  parseMessages
} from './RushdProtocol';
export { getPipePath, isDaemonAlive } from './RushdLifecycle';
