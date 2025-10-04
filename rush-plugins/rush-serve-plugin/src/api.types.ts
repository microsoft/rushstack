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
   * The enabled state of the operation.
   * - `never`: The operation is disabled and will not be executed.
   * - `ignore-dependency-changes`: The operation will be executed if there are local changes in the project,
   *   otherwise it will be skipped.
   * - `always`: The operation will be executed if it or any dependencies changed.
   */
  enabled: ReadableOperationEnabledState;

  /**
   * If true, this operation is configured to be silent and is included for completeness.
   */
  silent: boolean;

  /**
   * If true, this operation is configured to be a noop and is included for graph completeness.
   */
  noop: boolean;
}

/**
 * Dynamic execution state for an operation (separated from the static graph definition in IOperationInfo).
 * Both interfaces contain the operation "name" field for correlation.
 */
export interface IOperationExecutionState {
  /**
   * The display name of the operation.
   */
  name: string;

  /**
   * Indicates whether this operation is scheduled to actually run in the current execution iteration.
   * This is derived from the scheduler's decision (the execution record's `enabled` boolean), which
   * takes into account the configured enabled state plus change detection and dependency invalidation.
   */
  runInThisIteration: boolean;

  /**
   * If true, this operation currently owns some kind of active resource (e.g. a service or a watch process).
   */
  isActive: boolean;

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
 * Message sent to a WebSocket client at the start of an execution iteration.
 */
// Event (server->client) message interfaces (alphabetically by interface name)
/**
 * Message sent to a WebSocket client at the end of an execution iteration.
 */
export interface IWebSocketAfterExecuteEventMessage {
  event: 'after-execute';
  executionStates: IOperationExecutionState[];
  status: ReadableOperationStatus;
  /**
   * The results of the previous execution iteration for all operations, if available.
   * This mirrors the values() of OperationExecutionManager.lastExecutionResults at the time of emission.
   */
  lastExecutionResults?: IOperationExecutionState[];
}

/**
 * Message sent to a WebSocket client when one or more operations change status.
 *
 * Batched to reduce noise and improve throughput.
 */
export interface IWebSocketBatchStatusChangeEventMessage {
  event: 'status-change';
  executionStates: IOperationExecutionState[];
}

/**
 * Message sent to a WebSocket client at the start of an execution iteration.
 */
export interface IWebSocketBeforeExecuteEventMessage {
  event: 'before-execute';
  executionStates: IOperationExecutionState[];
}

/**
 * Message sent to a WebSocket client upon initial connection, or when explicitly requested.
 *
 * @see IWebSocketSyncCommandMessage
 */
export interface IWebSocketSyncEventMessage {
  event: 'sync';
  /**
   * Static graph definition (one entry per operation in the execution manager).
   */
  operations: IOperationInfo[];
  /**
   * Current dynamic execution states for all known operations.
   */
  currentExecutionStates: IOperationExecutionState[];
  /**
   * Execution states for operations that have been queued for the next iteration (if any)
   * when the sync message was generated.
   */
  queuedStates?: IOperationExecutionState[];
  sessionInfo: IRushSessionInfo;
  status: ReadableOperationStatus;
  managerState: {
    parallelism: number;
    debugMode: boolean;
    verbose: boolean;
    pauseNextIteration: boolean;
    status: ReadableOperationStatus;
    hasScheduledIteration: boolean;
  };
  /**
   * The results of the previous execution for all operations, if available.
   * This mirrors the values() of OperationExecutionManager.lastExecutionResults at the time of emission.
   */
  lastExecutionResults?: IOperationExecutionState[];
}

/**
 * Message sent to a WebSocket client containing a full refresh of only the dynamic execution states.
 */
export interface IWebSocketSyncOperationsEventMessage {
  event: 'sync-operations';
  operations: IOperationInfo[];
}

/**
 * Message sent when an iteration is queued with its initial set of queued operations.
 */
export interface IWebSocketPassQueuedEventMessage {
  event: 'iteration-scheduled';
  queuedStates: IOperationExecutionState[];
}

/**
 * Message sent to a WebSocket client containing only updated settings (no operations list).
 */
export interface IWebSocketSyncManagerStateEventMessage {
  event: 'sync-manager-state';
  managerState: IWebSocketSyncEventMessage['managerState'];
}

export interface IWebSocketTerminalChunkEventMessage {
  event: 'terminal-chunk';
  kind: 'stdout' | 'stderr';
  text: string;
}

/**
 * The set of possible messages sent to a WebSocket client.
 */
export type IWebSocketEventMessage =
  | IWebSocketAfterExecuteEventMessage
  | IWebSocketBatchStatusChangeEventMessage
  | IWebSocketBeforeExecuteEventMessage
  | IWebSocketSyncEventMessage
  | IWebSocketSyncOperationsEventMessage
  | IWebSocketPassQueuedEventMessage
  | IWebSocketSyncManagerStateEventMessage;

/**
 * Message received from a WebSocket client to request a sync.
 */
// Command (client->server) message interfaces (alphabetically by interface name)
/**
 * Message received from a WebSocket client to request abortion of the current execution iteration.
 */
export interface IWebSocketAbortExecutionCommandMessage {
  command: 'abort-execution';
}

/**
 * Message to abort the entire watch session (similar to pressing 'q').
 */
export interface IWebSocketAbortSessionCommandMessage {
  command: 'abort-session';
}

/**
 * Message received from a WebSocket client to request closing of active operation runners.
 */
export interface IWebSocketCloseRunnersCommandMessage {
  command: 'close-runners';
  operationNames?: string[];
}

/**
 * Message received from a WebSocket client to request execution of a new execution iteration.
 */
export interface IWebSocketExecuteCommandMessage {
  command: 'execute';
}

/**
 * Message received from a WebSocket client to request invalidation of one or more operations.
 */
export interface IWebSocketInvalidateCommandMessage {
  command: 'invalidate';
  operationNames?: string[];
}

/**
 * Message received from a WebSocket client to toggle debug logging mode.
 * A value of true enables debug mode; false disables it.
 */
export interface IWebSocketSetDebugCommandMessage {
  command: 'set-debug';
  value: boolean;
}

/**
 * Message received from a WebSocket client to change the enabled states of one or more operations.
 */
export interface IWebSocketSetEnabledStatesCommandMessage {
  command: 'set-enabled-states';
  /**
   * The names of the operations whose enabled state should be updated.
   */
  operationNames: string[];
  /**
   * The target enabled state. 'never', 'ignore-dependency-changes', or 'affected'.
   */
  targetState: ReadableOperationEnabledState;
  /**
   * Mode controlling how the enabled state is applied. "safe" applies dependency-aware logic,
   * "unsafe" only mutates the provided operations.
   */
  mode: 'safe' | 'unsafe';
}

/**
 * Message received to set absolute parallelism value.
 */
export interface IWebSocketSetParallelismCommandMessage {
  command: 'set-parallelism';
  parallelism: number;
}

/**
 * Message received from a WebSocket client to set whether new execution iterations are paused when scheduled.
 * A value of true means iterations are paused (manual mode); false means iterations run automatically.
 */
export interface IWebSocketSetPauseNextIterationCommandMessage {
  command: 'set-pause-next-iteration';
  value: boolean;
}

/**
 * Message received from a WebSocket client to set verbose logging mode (true =&gt; verbose on, quiet off).
 */
export interface IWebSocketSetVerboseCommandMessage {
  command: 'set-verbose';
  value: boolean; // true => verbose on (quiet off)
}

/**
 * Message received from a WebSocket client to request a sync of the full state.
 */
export interface IWebSocketSyncCommandMessage {
  command: 'sync';
}

/**
 * The set of possible operation enabled states.
 */
export type ReadableOperationEnabledState = 'never' | 'ignore-dependency-changes' | 'affected';

/**
 * The set of possible messages received from a WebSocket client.
 */
export type IWebSocketCommandMessage =
  | IWebSocketAbortExecutionCommandMessage
  | IWebSocketAbortSessionCommandMessage
  | IWebSocketCloseRunnersCommandMessage
  | IWebSocketExecuteCommandMessage
  | IWebSocketInvalidateCommandMessage
  | IWebSocketSetDebugCommandMessage
  | IWebSocketSetEnabledStatesCommandMessage
  | IWebSocketSetParallelismCommandMessage
  | IWebSocketSetPauseNextIterationCommandMessage
  | IWebSocketSetVerboseCommandMessage
  | IWebSocketSyncCommandMessage;
