// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The semantic outcome of a daemon command.
 *
 * @beta
 */
export type DaemonCommandOutcome = 'success' | 'success-with-warning' | 'failure' | 'aborted';

/**
 * The authoritative final result delivered after a daemon command's output has drained.
 *
 * @beta
 */
export interface IDaemonCommandResult {
  /** Whether cancellation or disconnect was observed, even if a cleanup failure determines the outcome. */
  readonly aborted: boolean;
  /** The process exit code a compatible in-process Rush invocation would return. */
  readonly exitCode: number;
  /** A failure description for execution or cleanup failures that were not already operation-scoped. */
  readonly errorMessage?: string;
  /** The semantic command outcome. */
  readonly outcome: DaemonCommandOutcome;
  /** The identifier copied from the request. */
  readonly requestId: string;
}
