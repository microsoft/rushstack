// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IExecutionResult,
  ILogFilePaths,
  IOperationExecutionResult,
  IOperationGraph,
  IOperationStateHashComponents,
  IStopwatchResult,
  Operation,
  _IOperationActivityOptions
} from '@microsoft/rush-lib';
import { OperationStatus, _printOperationStatus } from '@microsoft/rush-lib';
import {
  StdioSummarizer,
  Terminal,
  TerminalProviderSeverity,
  type IProblemCollector,
  type ITerminal,
  type ITerminalProvider
} from '@rushstack/terminal';

import { getEngineActivityOptions, type IEngineActivityOptions } from './EngineActivityOptions';

const SECONDS_PER_MINUTE: number = 60;
const MILLISECONDS_PER_SECOND: number = 1000;
const STDOUT_ACTIVITY: IEngineActivityOptions = { stderr: false };
const STDERR_ACTIVITY: IEngineActivityOptions = { stderr: true };
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
  getObservedResult(
    operation: Operation
  ): { readonly executionResult: IOperationExecutionResult } | undefined;
  /** The record of one of this request's operations in the iteration that it is part of. */
  getScheduledResult(operation: Operation): IOperationExecutionResult | undefined;
  onActivity(text: string, options?: _IOperationActivityOptions): void;
}

export interface IPhasedRequestResultsOptions {
  readonly activeOperations: ReadonlyArray<Operation>;
  readonly graph: IOperationGraph;
  readonly sink: IPhasedRequestSummarySink;
  /** Whether the request environment allows warnings in a successful build (`RUSH_ALLOW_WARNINGS_IN_SUCCESSFUL_BUILD`). */
  readonly warningsAllowedByEnvironment: boolean;
}

export interface IWritePhasedRequestSummaryOptions extends IPhasedRequestResultsOptions {
  readonly commandName: string;
  readonly executionError: unknown;
  /**
   * Called with the request's results after the status tables and before the duration line. Its terminal writes
   * into the request's own output, and, unlike the summary's own lines, its warnings and errors carry their
   * severity. If it throws, the summary reports errors and then rethrows the error.
   */
  readonly onResultsAsync: ((results: IExecutionResult, terminal: ITerminal) => Promise<void>) | undefined;
  /** The `performance.now()` timestamp at which the request started. */
  readonly startTimeMs: number;
}

const NEVER_STARTED_STOPWATCH: IStopwatchResult = {
  duration: 0,
  endTime: undefined,
  startTime: undefined,
  toString: () => '0.00 seconds'
};
const NO_PROBLEMS: IProblemCollector = { problems: new Set() };
const NO_OUTPUT: StdioSummarizer = new StdioSummarizer();
NO_OUTPUT.close();

/**
 * The result of a selected operation that a request did not need to run, because the operation was already up to
 * date. Unlike a result that the graph reports, it describes only this request, so it has the `Skipped` status, no
 * error, no problems, no output or log files and a stopwatch that was never started. The iteration id and state
 * hashes are those of the previous result, which produced the operation's current outputs.
 */
class UpToDateOperationResult implements IOperationExecutionResult {
  public readonly enabled: boolean = false;
  public readonly error: undefined = undefined;
  public readonly logFilePaths: ILogFilePaths | undefined = undefined;
  public readonly nonCachedDurationMs: undefined = undefined;
  public readonly problemCollector: IProblemCollector = NO_PROBLEMS;
  public readonly silent: boolean = false;
  public readonly status: OperationStatus = OperationStatus.Skipped;
  public readonly stdioSummarizer: StdioSummarizer = NO_OUTPUT;
  public readonly stopwatch: IStopwatchResult = NEVER_STARTED_STOPWATCH;
  readonly #previous: IOperationExecutionResult;

  public constructor(previous: IOperationExecutionResult) {
    this.#previous = previous;
  }

  public get iterationId(): number {
    return this.#previous.iterationId;
  }

  public get metadataFolderPath(): string {
    return this.#previous.metadataFolderPath;
  }

  public get operation(): Operation {
    return this.#previous.operation;
  }

  public get shouldRunnerPersist(): boolean {
    return this.#previous.shouldRunnerPersist;
  }

  public getStateHash(): string {
    return this.#previous.getStateHash();
  }

  public getStateHashComponents(): IOperationStateHashComponents {
    return this.#previous.getStateHashComponents();
  }
}

/**
 * The activity options of the summary's own lines. Warnings and errors among them carry no severity, because clients
 * that print only a summary give their own verdict.
 */
function getSummaryActivityOptions(severity: TerminalProviderSeverity): IEngineActivityOptions {
  return severity === TerminalProviderSeverity.error || severity === TerminalProviderSeverity.warning
    ? STDERR_ACTIVITY
    : STDOUT_ACTIVITY;
}

/**
 * Buffers terminal output into request-scoped activity events, one event per contiguous run of text that has the
 * same activity options.
 */
class RequestActivityTerminalProvider implements ITerminalProvider {
  public readonly supportsColor: boolean = false;
  public readonly eolCharacter: string = '\n';
  readonly #sink: IPhasedRequestSummarySink;
  readonly #getActivityOptions: (severity: TerminalProviderSeverity) => IEngineActivityOptions;
  #buffer: string = '';
  #activityOptions: IEngineActivityOptions = STDOUT_ACTIVITY;

  public constructor(
    sink: IPhasedRequestSummarySink,
    getActivityOptions: (severity: TerminalProviderSeverity) => IEngineActivityOptions
  ) {
    this.#sink = sink;
    this.#getActivityOptions = getActivityOptions;
  }

  public write(text: string, severity: TerminalProviderSeverity): void {
    if (severity === TerminalProviderSeverity.verbose || severity === TerminalProviderSeverity.debug) {
      return;
    }
    const activityOptions: IEngineActivityOptions = this.#getActivityOptions(severity);
    if (activityOptions !== this.#activityOptions) {
      this.flush();
      this.#activityOptions = activityOptions;
    }
    this.#buffer += text;
  }

  public flush(): void {
    if (this.#buffer.length > 0) {
      this.#sink.onActivity(this.#buffer, this.#activityOptions);
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
 * selection rather than from the whole iteration; see {@link collectPhasedRequestResults}.
 */
export async function writePhasedRequestSummaryAsync(
  options: IWritePhasedRequestSummaryOptions
): Promise<void> {
  const { commandName, executionError, onResultsAsync, sink, startTimeMs } = options;
  const provider: RequestActivityTerminalProvider = new RequestActivityTerminalProvider(
    sink,
    getSummaryActivityOptions
  );
  const terminal: Terminal = new Terminal(provider);
  let callbackFailed: boolean = false;
  let callbackError: unknown;
  try {
    if (executionError === undefined) {
      const results: IExecutionResult = collectPhasedRequestResults(options);
      _printOperationStatus(terminal, results);
      if (onResultsAsync) {
        // The status tables precede what the callback writes.
        provider.flush();
        // The callback's warnings and errors keep their severity, as they do on the engine's terminal, so that
        // clients that print only a summary still show them.
        const callbackProvider: RequestActivityTerminalProvider = new RequestActivityTerminalProvider(
          sink,
          getEngineActivityOptions
        );
        try {
          await onResultsAsync(results, new Terminal(callbackProvider));
        } catch (error) {
          callbackFailed = true;
          callbackError = error;
        } finally {
          callbackProvider.flush();
        }
      }
    }
    const duration: string = formatDuration(performance.now() - startTimeMs);
    if (executionError === undefined && !callbackFailed) {
      terminal.writeLine(`rush ${commandName} (${duration})`);
    } else {
      terminal.writeErrorLine(`rush ${commandName} - Errors! (${duration})`);
    }
  } finally {
    provider.flush();
  }
  if (callbackFailed) {
    throw callbackError;
  }
}

/**
 * Collects the results of the operations that one phased request selected, and the request's overall status.
 *
 * @remarks
 * Operations are listed in graph order, as in the native summary, and silent operations are left out. A selected
 * operation that the warm graph did not need to run is reported as an {@link UpToDateOperationResult}, so a warm
 * no-op still reports what it checked. A request that returns early leaves out the operations that have not
 * finished.
 */
export function collectPhasedRequestResults(options: IPhasedRequestResultsOptions): IExecutionResult {
  const operationResults: ReadonlyMap<Operation, IOperationExecutionResult> =
    collectOperationResults(options);
  return {
    operationResults,
    status: getSummaryStatus(operationResults, options.warningsAllowedByEnvironment)
  };
}

function collectOperationResults(
  options: IPhasedRequestResultsOptions
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
    // A request that returns early is summarized while its iteration runs, before some operations report.
    const current: IOperationExecutionResult | undefined = observed ?? sink.getScheduledResult(operation);
    if (current && !current.silent) {
      if (SUMMARIZED_STATUSES.has(current.status)) {
        results.set(operation, current);
      }
      continue;
    }
    // A silent observed record belongs to an operation the graph disabled because it was already up to date.
    const previous: IOperationExecutionResult | undefined =
      observed ?? graph.resultByOperation.get(operation);
    if (previous) {
      // The shared record itself must not change, because other requests and the next iteration read it.
      results.set(operation, new UpToDateOperationResult(previous));
    }
  }
  return results;
}

function getSummaryStatus(
  results: ReadonlyMap<Operation, IOperationExecutionResult>,
  warningsAllowedByEnvironment: boolean
): OperationStatus {
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
        if (
          status === OperationStatus.Success &&
          !warningsAllowedByEnvironment &&
          !operation.runner?.warningsAreAllowed
        ) {
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
