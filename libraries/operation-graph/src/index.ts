// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="node" preserve="true" />

export type {
  IOperationRunner,
  IOperationRunnerContext,
  IOperationState,
  IOperationStates
} from './IOperationRunner.ts';

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
} from './protocol.types.ts';

export {
  type IExecuteOperationContext,
  type IOperationOptions,
  Operation,
  type OperationRequestRunCallback
} from './Operation.ts';

export { OperationError } from './OperationError.ts';

export { type IOperationExecutionOptions, OperationExecutionManager } from './OperationExecutionManager.ts';

export { OperationGroupRecord } from './OperationGroupRecord.ts';

export { OperationStatus } from './OperationStatus.ts';

export { Stopwatch } from './Stopwatch.ts';

export { type IWatchLoopOptions, type IWatchLoopState, WatchLoop } from './WatchLoop.ts';
