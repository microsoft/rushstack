// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { OperationStatus } from '@rushstack/rush-sdk';

/**
 * Human readable status values. These are the PascalCase keys of the `OperationStatus` enumeration.
 */
export type ReadableOperationStatus = keyof typeof OperationStatus;

/**
 * Information about an operation in the graph.
 */
export interface IOperationInfo {
  /**
   * The display name of the operation.
   */
  name: string;

  /**
   * The npm package name of the containing Rush Project.
   */
  packageName: string;

  /**
   * The name of the containing phase.
   */
  phaseName: string;

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
 * The set of possible messages received from a WebSocket client.
 */
export type IWebSocketCommandMessage = IWebSocketSyncCommandMessage;
