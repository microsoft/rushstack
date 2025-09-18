// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { OperationStatus } from '@rushstack/rush-sdk';

/**
 * Human readable status values. These are the PascalCase keys of the `OperationStatus` enumeration.
 */
export type ReadableOperationStatus = keyof typeof OperationStatus;

export interface ILogFileURLs {
  /**
   * The relative URL to the merged (interleaved stdout and stderr) text log.
   */
  text: string;

  /**
   * The relative URL to the stderr log file.
   */
  error: string;

  /**
   * The relative URL to the JSONL log file.
   */
  jsonl: string;
}

/**
 * Information about an operation in the graph.
 */
export interface IOperationInfo {
  /**
   * The display name of the operation.
   */
  name: string;

  /**
   * The names of the dependencies of the operation.
   */
  dependencies: string[];

  /**
   * The npm package name of the containing Rush Project.
   */
  packageName: string;

  /**
   * The name of the containing phase.
   */
  phaseName: string;

  /**
   * If false, this operation is disabled and will/did not execute during the current run.
   * The status will be reported as `Skipped`.
   */
  enabled: boolean;

  /**
   * If true, this operation is configured to be silent and is included for completeness.
   */
  silent: boolean;

  /**
   * If true, this operation is configured to be a noop and is included for graph completeness.
   */
  noop: boolean;

  /**
   * The current status of the operation. This value is in PascalCase and is the key of the corresponding `OperationStatus` constant.
   */
  status: ReadableOperationStatus;

  /**
   * The URLs to the log files, if applicable.
   */
  logFileURLs: ILogFileURLs | undefined;

  /**
   * The start time of the operation, if it has started, in milliseconds. Not wall clock time.
   */
  startTime: number | undefined;

  /**
   * The end time of the operation, if it has finished, in milliseconds. Not wall clock time.
   */
  endTime: number | undefined;
}

/**
 * Information about the current Rush session.
 */
export interface IRushSessionInfo {
  /**
   * The name of the command being run.
   */
  actionName: string;

  /**
   * A unique identifier for the repository in which this Rush is running.
   */
  repositoryIdentifier: string;
}

/**
 * Message sent to a WebSocket client at the start of an execution pass.
 */
export interface IWebSocketBeforeExecuteEventMessage {
  event: 'before-execute';
  operations: IOperationInfo[];
}

/**
 * Message sent to a WebSocket client at the end of an execution pass.
 */
export interface IWebSocketAfterExecuteEventMessage {
  event: 'after-execute';
  operations: IOperationInfo[];
  status: ReadableOperationStatus;
}

/**
 * Message sent to a WebSocket client when one or more operations change status.
 *
 * Batched to reduce noise and improve throughput.
 */
export interface IWebSocketBatchStatusChangeEventMessage {
  event: 'status-change';
  operations: IOperationInfo[];
}

/**
 * Message sent to a WebSocket client upon initial connection, or when explicitly requested.
 *
 * @see IWebSocketSyncCommandMessage
 */
export interface IWebSocketSyncEventMessage {
  event: 'sync';
  operations: IOperationInfo[];
  sessionInfo: IRushSessionInfo;
  status: ReadableOperationStatus;
}

/**
 * The set of possible messages sent to a WebSocket client.
 */
export type IWebSocketEventMessage =
  | IWebSocketBeforeExecuteEventMessage
  | IWebSocketAfterExecuteEventMessage
  | IWebSocketBatchStatusChangeEventMessage
  | IWebSocketSyncEventMessage;

/**
 * Message received from a WebSocket client to request a sync.
 */
export interface IWebSocketSyncCommandMessage {
  command: 'sync';
}

/**
 * Message received from a WebSocket client to request abortion of the current execution pass.
 */
export interface IWebSocketAbortExecutionCommandMessage {
  command: 'abort-execution';
}

/**
 * Message received from a WebSocket client to request invalidation of one or more operations.
 */
export interface IWebSocketInvalidateCommandMessage {
  command: 'invalidate';
  operationNames: string[];
}

/**
 * The set of possible operation enabled states.
 */
export type OperationEnabledState = 'never' | 'changed' | 'affected' | 'default';

/**
 * Message received from a WebSocket client to change the enabled states of operations.
 */
export interface IWebSocketSetEnabledStatesCommandMessage {
  command: 'set-enabled-states';
  enabledStateByOperationName: Record<string, OperationEnabledState>;
}

/**
 * The set of possible messages received from a WebSocket client.
 */
export type IWebSocketCommandMessage =
  | IWebSocketSyncCommandMessage
  | IWebSocketAbortExecutionCommandMessage
  | IWebSocketInvalidateCommandMessage
  | IWebSocketSetEnabledStatesCommandMessage;
