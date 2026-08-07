// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The terminal or transient status of a scheduled operation.
 *
 * @beta
 */
export type OperationStatus =
  | 'ready'
  | 'executing'
  | 'success'
  | 'successWithWarnings'
  | 'failure'
  | 'blocked'
  | 'skipped'
  | 'fromCache'
  | 'noOp';

/**
 * The payload of a `sessionStarted` event.
 *
 * @beta
 */
export interface ISessionStartedPayload {
  /**
   * The Rush version that started the session.
   */
  readonly rushVersion: string;

  /**
   * The working directory, when recorded.
   */
  readonly cwd?: string;
}

/**
 * The payload of a `sessionCompleted` event.
 *
 * @beta
 */
export interface ISessionCompletedPayload {
  /**
   * The process exit code.
   */
  readonly exitCode: number;

  /**
   * The total session duration in milliseconds.
   */
  readonly durationMs?: number;
}

/**
 * The payload of a `commandStarted` event.
 *
 * @beta
 */
export interface ICommandStartedPayload {
  /**
   * The command name.
   */
  readonly commandName: string;

  /**
   * The command arguments.
   */
  readonly argv?: readonly string[];
}

/**
 * The payload of a `commandCompleted` event.
 *
 * @beta
 */
export interface ICommandCompletedPayload {
  /**
   * The command name.
   */
  readonly commandName: string;

  /**
   * The process exit code.
   */
  readonly exitCode: number;

  /**
   * The command duration in milliseconds.
   */
  readonly durationMs?: number;
}

/**
 * The payload of an `operationRegistered` event.
 *
 * @beta
 */
export interface IOperationRegisteredPayload {
  /**
   * The operation id.
   */
  readonly operationId: string;

  /**
   * The project the operation belongs to.
   */
  readonly projectName?: string;

  /**
   * The phase the operation belongs to.
   */
  readonly phaseName?: string;
}

/**
 * The payload of an `operationStatusChanged` event.
 *
 * @beta
 */
export interface IOperationStatusChangedPayload {
  /**
   * The operation id.
   */
  readonly operationId: string;

  /**
   * The new status.
   */
  readonly status: OperationStatus;
}

/**
 * The payload of a `commandResult` event.
 *
 * @beta
 */
export interface ICommandResultPayload {
  /**
   * The command name.
   */
  readonly commandName: string;

  /**
   * Whether the command succeeded, including warning-only success.
   */
  readonly succeeded: boolean;

  /**
   * The process exit code.
   */
  readonly exitCode: number;

  /**
   * Operation counts keyed by status.
   */
  readonly operationCounts?: { readonly [status: string]: number };
}

/**
 * The payload of a `watchCycleCompleted` event.
 *
 * @beta
 */
export interface IWatchCycleCompletedPayload {
  /**
   * Whether the watch cycle succeeded.
   */
  readonly succeeded: boolean;

  /**
   * The projects that changed to trigger the cycle.
   */
  readonly changedProjects?: readonly string[];
}
