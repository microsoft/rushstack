// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminalChunk } from '@rushstack/terminal';

import type { IOperationExecutionResult } from './IOperationExecutionResult';
import type { OperationStatus } from './OperationStatus';

/**
 * Provenance of a status line emitted via the sink's activity callback.
 *
 * @internal
 */
export interface IOperationActivityOptions {
  /**
   * Set when the line was written to an operation's own collated stream.
   */
  readonly operationId?: string;
  /**
   * True when the line was written to stderr.
   */
  readonly stderr?: boolean;
}

/**
 * A structured, presentation-free event sink for the operation graph.
 *
 * @remarks
 * When a host (for example the Rush daemon) assigns a sink, the engine
 * "dual-emits": every operation state transition and every status line that
 * would be written as colorized terminal text is also emitted here as
 * structured data, with no change to the existing terminal output.
 *
 * All events are emitted synchronously in engine order. Implementations must
 * not call back into the graph.
 *
 * @internal
 */
export interface IOperationGraphEventSink {
  /**
   * Invoked when an operation is prepared for an iteration.
   */
  onOperationRegistered?(operationId: string, silent: boolean, result?: IOperationExecutionResult): void;

  /**
   * Invoked synchronously on every operation status transition. The result's
   * `status`, `error`, and `stopwatch` reflect the new state.
   */
  onOperationStatusChanged?(result: IOperationExecutionResult, previousStatus: OperationStatus): void;

  /**
   * Invoked when an operation's collated output is about to be displayed,
   * with the progress counters rendered in the legacy
   * `==[ name ]===[ x of y ]==` header.
   */
  onOperationHeader?(operationId: string, completedOperations: number, totalOperations: number): void;

  /**
   * Invoked for each chunk of an operation's raw output, upstream of any
   * newline normalization or quiet-mode filtering.
   */
  onOperationChunk?(operationId: string, chunk: ITerminalChunk, result?: IOperationExecutionResult): void;

  /**
   * Invoked when an operation's collated output stream is closed at the end of
   * its execution, after all status lines and output have been written. This
   * is the authoritative "no more output for this operation" signal.
   */
  onOperationStreamClosed?(operationId: string, result?: IOperationExecutionResult): void;

  /**
   * Invoked after the operation stream is closed and the final outcome is authoritative.
   */
  onOperationCompleted?(result: IOperationExecutionResult): void;

  /**
   * Invoked for each human-oriented status line written to the terminal,
   * carrying the plain (pre-colorization) text.
   */
  onActivity?(text: string, options?: IOperationActivityOptions): void;
}
