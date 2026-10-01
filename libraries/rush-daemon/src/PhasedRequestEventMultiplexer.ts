// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type IOperationExecutionResult,
  OperationStatus,
  type _IOperationActivityOptions,
  type _IOperationGraphEventSink,
  _formatIterationStartLines
} from '@microsoft/rush-lib';
import type { ITerminalChunk } from '@rushstack/terminal';

export interface IRequestEventSink extends _IOperationGraphEventSink {
  onIterationScheduled(records: Iterable<IOperationExecutionResult>): void;
}

/** The iteration that was last scheduled, as far as the request sinks have been told about it. */
interface IAnnouncedIteration {
  readonly records: ReadonlyArray<IOperationExecutionResult>;
  /** The arguments of `onIterationStarting`, once the iteration started. */
  start: { readonly parallelism: number; readonly quietMode: boolean } | undefined;
}

export class PhasedRequestEventMultiplexer implements _IOperationGraphEventSink {
  readonly #workspaceSink: _IOperationGraphEventSink | undefined;
  readonly #requestSinks: Set<IRequestEventSink> = new Set();
  #iteration: IAnnouncedIteration | undefined;
  /** While set, the status changes of other records reach only the workspace sink; see `runForIterationRecords`. */
  #forwardedRecords: ReadonlySet<IOperationExecutionResult> | undefined;

  public constructor(workspaceSink: _IOperationGraphEventSink | undefined) {
    this.#workspaceSink = workspaceSink;
  }

  public subscribe(requestSink: IRequestEventSink): () => void {
    this.#requestSinks.add(requestSink);
    let subscribed: boolean = true;
    return () => {
      if (subscribed) {
        subscribed = false;
        this.#requestSinks.delete(requestSink);
      }
    };
  }

  /**
   * Subscribes a request sink to the iteration that is executing, as if it had been subscribed before the iteration
   * was scheduled.
   *
   * @remarks
   * The sink first receives the iteration's records, the registration of each record, the start of the iteration if
   * it started, and, for each record whose status changed, a change from its initial status to its current one. It
   * then receives the iteration's events as the other request sinks do. It does not receive the headers and output
   * that operations wrote before it subscribed.
   */
  public subscribeToCurrentIteration(requestSink: IRequestEventSink): () => void {
    const iteration: IAnnouncedIteration | undefined = this.#iteration;
    if (!iteration) {
      throw new Error('No iteration was scheduled.');
    }
    const { records, start } = iteration;
    requestSink.onIterationScheduled(records);
    for (const record of records) {
      requestSink.onOperationRegistered?.(record.operation.name, record.silent, record, record.iterationId);
    }
    if (start) {
      announceIteration(requestSink, records, start.parallelism, start.quietMode);
    }
    for (const record of records) {
      const initialStatus: OperationStatus = getInitialStatus(record);
      if (record.status !== initialStatus) {
        requestSink.onOperationStatusChanged?.(record, initialStatus);
      }
    }
    return this.subscribe(requestSink);
  }

  /**
   * Runs `callback`, during which the status changes of records that are not the scheduled iteration's reach only the
   * workspace sink.
   *
   * @remarks
   * Adding a request's work to the executing iteration invalidates the retained results of earlier iterations whose
   * inputs changed, as the reconciliation before an iteration does. No request sink is subscribed during that
   * reconciliation, so no request sink observes those results change during this one either.
   */
  public runForIterationRecords<T>(callback: () => T): T {
    const previous: ReadonlySet<IOperationExecutionResult> | undefined = this.#forwardedRecords;
    this.#forwardedRecords = new Set(this.#iteration?.records);
    try {
      return callback();
    } finally {
      this.#forwardedRecords = previous;
    }
  }

  public onIterationScheduled(records: Iterable<IOperationExecutionResult>): void {
    const executionResults: IOperationExecutionResult[] = [...records];
    this.#iteration = { records: executionResults, start: undefined };
    for (const requestSink of this.#requestSinks) {
      requestSink.onIterationScheduled(executionResults);
    }
  }

  public onOperationRegistered(
    operationId: string,
    silent: boolean,
    result?: IOperationExecutionResult,
    iterationId?: number
  ): void {
    this.#workspaceSink?.onOperationRegistered?.(operationId, silent, result, iterationId);
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationRegistered?.(operationId, silent, result, iterationId);
    }
  }

  public onOperationStatusChanged(result: IOperationExecutionResult, previousStatus: OperationStatus): void {
    this.#workspaceSink?.onOperationStatusChanged?.(result, previousStatus);
    if (this.#forwardedRecords && !this.#forwardedRecords.has(result)) {
      return;
    }
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationStatusChanged?.(result, previousStatus);
    }
  }

  public onOperationHeader(operationId: string, completed: number, total: number): void {
    this.#workspaceSink?.onOperationHeader?.(operationId, completed, total);
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationHeader?.(operationId, completed, total);
    }
  }

  public onOperationChunk(
    operationId: string,
    chunk: ITerminalChunk,
    result?: IOperationExecutionResult,
    iterationId?: number
  ): void {
    this.#workspaceSink?.onOperationChunk?.(operationId, chunk, result, iterationId);
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationChunk?.(operationId, chunk, result, iterationId);
    }
  }

  public onOperationStreamClosed(
    operationId: string,
    result?: IOperationExecutionResult,
    iterationId?: number
  ): void {
    this.#workspaceSink?.onOperationStreamClosed?.(operationId, result, iterationId);
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationStreamClosed?.(operationId, result, iterationId);
    }
  }

  public onOperationCompleted(result: IOperationExecutionResult): void {
    this.#workspaceSink?.onOperationCompleted?.(result);
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationCompleted?.(result);
    }
  }

  /**
   * Lets each sink that announces iterations itself announce this one, so that each request sink can list only
   * its own operations. Any other sink receives the announcement of all of the iteration's operations as activity,
   * as it would without this multiplexer.
   */
  public onIterationStarting(
    records: ReadonlyArray<IOperationExecutionResult>,
    parallelism: number,
    quietMode: boolean
  ): void {
    if (this.#iteration) {
      this.#iteration.start = { parallelism, quietMode };
    }
    const lines: string[] = [];
    if (this.#workspaceSink) {
      announceIteration(this.#workspaceSink, records, parallelism, quietMode, lines);
    }
    for (const requestSink of this.#requestSinks) {
      announceIteration(requestSink, records, parallelism, quietMode, lines);
    }
  }

  public onActivity(text: string, options?: _IOperationActivityOptions): void {
    this.#workspaceSink?.onActivity?.(text, options);
    for (const requestSink of this.#requestSinks) {
      requestSink.onActivity?.(text, options);
    }
  }
}

/**
 * Lets a sink that announces iterations itself announce this one. Any other sink receives the announcement of all of
 * the iteration's operations as activity; `lines` caches its lines for the other sinks.
 */
function announceIteration(
  sink: _IOperationGraphEventSink,
  records: ReadonlyArray<IOperationExecutionResult>,
  parallelism: number,
  quietMode: boolean,
  lines: string[] = []
): void {
  if (sink.onIterationStarting) {
    sink.onIterationStarting(records, parallelism, quietMode);
  } else if (sink.onActivity) {
    if (lines.length === 0) {
      lines.push(..._formatIterationStartLines(getNonSilentOperationNames(records), parallelism, quietMode));
    }
    for (const line of lines) {
      sink.onActivity(line);
    }
  }
}

/** The status with which Rush creates the record of an operation for an iteration. */
function getInitialStatus(record: IOperationExecutionResult): OperationStatus {
  return record.operation.dependencies.size > 0 ? OperationStatus.Waiting : OperationStatus.Ready;
}

function getNonSilentOperationNames(records: ReadonlyArray<IOperationExecutionResult>): string[] {
  const operationNames: string[] = [];
  for (const record of records) {
    if (!record.silent) {
      operationNames.push(record.operation.name);
    }
  }
  return operationNames;
}
