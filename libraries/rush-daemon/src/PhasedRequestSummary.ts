// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IOperationExecutionResult,
  IOperationGraph,
  Operation,
  _IOperationActivityOptions
} from '@microsoft/rush-lib';
import { OperationStatus, _printOperationStatus } from '@microsoft/rush-lib';
import { Terminal, TerminalProviderSeverity, type ITerminalProvider } from '@rushstack/terminal';

const SECONDS_PER_MINUTE: number = 60;
const MILLISECONDS_PER_SECOND: number = 1000;
const SUMMARIZED_STATUSES: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.Aborted,
  OperationStatus.Blocked,
  OperationStatus.Failure,
  OperationStatus.FromCache,
  OperationStatus.NoOp,
  OperationStatus.Skipped,
  OperationStatus.Success,
  OperationStatus.SuccessWithWarning
]);

/** The subset of a request event sink used to render a request's end-of-run summary. */
export interface IPhasedRequestSummarySink {
  getObservedResult(operation: Operation): { readonly executionResult: IOperationExecutionResult } | undefined;
  onActivity(text: string, options?: _IOperationActivityOptions): void;
}

export interface IWritePhasedRequestSummaryOptions {
  readonly activeOperations: ReadonlyArray<Operation>;
  readonly commandName: string;
  readonly elapsedMs: number;
  readonly executionError: unknown;
  readonly graph: IOperationGraph;
  readonly sink: IPhasedRequestSummarySink;
}

/**
 * Buffers terminal output into request-scoped activity events, one event per contiguous stream run.
 */
class RequestActivityTerminalProvider implements ITerminalProvider {
  public readonly supportsColor: boolean = false;
  public readonly eolCharacter: string = '\n';
  readonly #sink: IPhasedRequestSummarySink;
  #buffer: string = '';
  #stderr: boolean = false;

  public constructor(sink: IPhasedRequestSummarySink) {
    this.#sink = sink;
  }

  public write(text: string, severity: TerminalProviderSeverity): void {
    if (severity === TerminalProviderSeverity.verbose || severity === TerminalProviderSeverity.debug) {
      return;
    }
    const stderr: boolean =
      severity === TerminalProviderSeverity.error || severity === TerminalProviderSeverity.warning;
    if (stderr !== this.#stderr) {
      this.flush();
      this.#stderr = stderr;
    }
    this.#buffer += text;
  }

  public flush(): void {
    if (this.#buffer.length > 0) {
      this.#sink.onActivity(this.#buffer, { stderr: this.#stderr });
      this.#buffer = '';
    }
  }
}

/**
 * Writes the native end-of-run summary (the status tables and the `rush <command> (<duration>)` line) for one
 * phased request into that request's own event sink.
 *
 * @remarks
 * Coalesced requests share one graph iteration, so the summary is computed per request from the request's own
 * selection rather than from the whole iteration. Selected operations that the warm graph did not need to run are
 * reported as already up to date, so a warm no-op still reports what it checked.
 */
export function writePhasedRequestSummary(options: IWritePhasedRequestSummaryOptions): void {
  const { commandName, elapsedMs, executionError, sink } = options;
  const provider: RequestActivityTerminalProvider = new RequestActivityTerminalProvider(sink);
  const terminal: Terminal = new Terminal(provider);
  const duration: string = formatDuration(elapsedMs);
  if (executionError === undefined) {
    const operationResults: ReadonlyMap<Operation, IOperationExecutionResult> =
      collectSummaryResults(options);
    _printOperationStatus(terminal, { operationResults, status: getSummaryStatus(operationResults) });
    terminal.writeLine(`rush ${commandName} (${duration})`);
  } else {
    terminal.writeErrorLine(`rush ${commandName} - Errors! (${duration})`);
  }
  provider.flush();
}

function collectSummaryResults(
  options: IWritePhasedRequestSummaryOptions
): ReadonlyMap<Operation, IOperationExecutionResult> {
  const { activeOperations, graph, sink } = options;
  const active: ReadonlySet<Operation> = new Set(activeOperations);
  const results: Map<Operation, IOperationExecutionResult> = new Map();
  // Iterate the graph so the summary lists operations in the same order as the native summary.
  for (const operation of graph.operations) {
    if (!active.has(operation) || operation.runner?.silent !== false) {
      continue;
    }
    const observed: IOperationExecutionResult | undefined =
      sink.getObservedResult(operation)?.executionResult;
    if (observed && !observed.silent) {
      if (SUMMARIZED_STATUSES.has(observed.status)) {
        results.set(operation, observed);
      }
      continue;
    }
    // A silent observed record belongs to an operation the graph disabled because it was already up to date.
    const previous: IOperationExecutionResult | undefined =
      observed ?? graph.resultByOperation.get(operation);
    if (previous) {
      results.set(operation, createUpToDateResult(previous));
    }
  }
  return results;
}

function createUpToDateResult(previous: IOperationExecutionResult): IOperationExecutionResult {
  // The summary only reads these members for skipped operations; the shared record itself must not change.
  const upToDate: Pick<IOperationExecutionResult, 'operation' | 'silent' | 'status' | 'stopwatch'> = {
    operation: previous.operation,
    silent: false,
    status: OperationStatus.Skipped,
    stopwatch: previous.stopwatch
  };
  return upToDate as IOperationExecutionResult;
}

function getSummaryStatus(results: ReadonlyMap<Operation, IOperationExecutionResult>): OperationStatus {
  let status: OperationStatus = OperationStatus.Success;
  for (const [operation, result] of results) {
    switch (result.status) {
      case OperationStatus.Failure:
      case OperationStatus.Blocked:
        return OperationStatus.Failure;
      case OperationStatus.Aborted:
        status = OperationStatus.Aborted;
        break;
      case OperationStatus.SuccessWithWarning:
        if (status === OperationStatus.Success && !operation.runner?.warningsAreAllowed) {
          status = OperationStatus.SuccessWithWarning;
        }
        break;
    }
  }
  return status;
}

/** Matches the native Rush stopwatch format, for example `1.23 seconds` or `2 minutes 3.4 seconds`. */
function formatDuration(elapsedMs: number): string {
  const totalSeconds: number = elapsedMs / MILLISECONDS_PER_SECOND;
  if (totalSeconds > SECONDS_PER_MINUTE) {
    const minutes: number = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
    const seconds: number = totalSeconds % SECONDS_PER_MINUTE;
    return `${minutes.toFixed(0)} minute${minutes === 1 ? '' : 's'} ${seconds.toFixed(1)} seconds`;
  }
  return `${totalSeconds.toFixed(2)} seconds`;
}
