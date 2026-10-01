// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as child_process from 'node:child_process';

import type { ITerminalChunk, ITerminalProvider } from '@rushstack/terminal';

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
 * A negotiated reporter channel allocated for one operation child process.
 *
 * @internal
 */
export interface IOperationChildProcessReporter {
  readonly environment: Readonly<Record<string, string>>;
  readonly hasWarningOrError: boolean;
  readonly stdio: child_process.StdioOptions;
  attachAsync(
    child: child_process.ChildProcess,
    structuredOutputTerminalProvider: ITerminalProvider
  ): Promise<void>;
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
  onOperationRegistered?(
    operationId: string,
    silent: boolean,
    result?: IOperationExecutionResult,
    iterationId?: number
  ): void;

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
  onOperationChunk?(
    operationId: string,
    chunk: ITerminalChunk,
    result?: IOperationExecutionResult,
    iterationId?: number
  ): void;

  /**
   * Invoked when an operation's collated output stream is closed at the end of
   * its execution, after all status lines and output have been written. This
   * is the authoritative "no more output for this operation" signal.
   */
  onOperationStreamClosed?(
    operationId: string,
    result?: IOperationExecutionResult,
    iterationId?: number
  ): void;

  /**
   * Invoked after the operation stream is closed and the final outcome is authoritative.
   */
  onOperationCompleted?(result: IOperationExecutionResult): void;

  /**
   * Invoked for each human-oriented status line written to the terminal,
   * carrying the plain (pre-colorization) text.
   */
  onActivity?(text: string, options?: IOperationActivityOptions): void;

  /**
   * Invoked once when an iteration starts executing, before any of its operations start.
   *
   * @remarks
   * The engine announces an iteration with a `Selected N operations:` listing, which quiet mode omits,
   * and an `Executing a maximum of N simultaneous processes...` line. A sink that does not implement
   * this method receives those lines through `onActivity`. A sink that implements it receives them only
   * through this call, so that a host serving several requests from one iteration can announce each
   * request's own operations with `_formatIterationStartLines`.
   *
   * @param records - Every operation of the iteration, including silent ones.
   * @param parallelism - The graph's parallelism for the iteration.
   * @param quietMode - Whether the graph is in quiet mode.
   */
  onIterationStarting?(
    records: ReadonlyArray<IOperationExecutionResult>,
    parallelism: number,
    quietMode: boolean
  ): void;

  /**
   * Allocates a reporter channel for a child spawned by the specified operation.
   */
  createChildProcessReporter?(
    operationId: string,
    iterationId: number
  ): IOperationChildProcessReporter | undefined;
}

/**
 * Renders the lines that announce an iteration: the `Selected N operations:` listing, unless `quietMode`
 * is set, followed by the `Executing a maximum of N simultaneous processes...` line.
 *
 * @param operationNames - The names of the operations to announce, which should not be silent, in any order.
 * @param parallelism - The graph's parallelism.
 * @param quietMode - Whether the graph is in quiet mode.
 * @returns The plain text of each line, in order.
 *
 * @internal
 */
export function _formatIterationStartLines(
  operationNames: Iterable<string>,
  parallelism: number,
  quietMode: boolean
): string[] {
  const sortedNames: string[] = Array.from(operationNames).sort();
  const lines: string[] = [];
  if (!quietMode) {
    const plural: string = sortedNames.length === 1 ? '' : 's';
    lines.push(`Selected ${sortedNames.length} operation${plural}:`);
    for (const name of sortedNames) {
      lines.push(`  ${name}`);
    }
    lines.push('');
  }
  // For logging purposes, don't confuse the user by suggesting we might run more operations in parallel than are scheduled.
  const maxSimultaneousProcesses: number = Math.min(sortedNames.length, parallelism);
  lines.push(`Executing a maximum of ${maxSimultaneousProcesses} simultaneous processes...`);
  return lines;
}
