// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="node" preserve="true" />

export type {
  IOperationRunner,
  IOperationRunnerContext,
  IOperationState,
  IOperationStates
} from './IOperationRunner';

export type {
  IAfterExecuteEventMessage,
  ISyncEventMessage,
  IRequestRunEventMessage,
  EventMessageFromClient,
  ICancelCommandMessage,
  IExitCommandMessage,
  IRunCommandMessage,
  ISyncCommandMessage,
  CommandMessageFromHost,
  IPCHost
} from './protocol.types';

export {
  type IExecuteOperationContext,
  type IOperationOptions,
  Operation,
  type OperationRequestRunCallback
} from './Operation';

export { OperationError } from './OperationError';

export { type IOperationExecutionOptions, OperationExecutionManager } from './OperationExecutionManager';

export { OperationGroupRecord } from './OperationGroupRecord';

export { OperationStatus } from './OperationStatus';

export { Stopwatch } from './Stopwatch';

export { type IWatchLoopOptions, type IWatchLoopState, WatchLoop } from './WatchLoop';
