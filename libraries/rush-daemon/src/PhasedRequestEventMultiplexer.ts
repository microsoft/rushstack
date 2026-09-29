// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type IOperationExecutionResult,
  type OperationStatus,
  type _IOperationActivityOptions,
  type _IOperationGraphEventSink,
  _formatIterationStartLines
} from '@microsoft/rush-lib';
import type { ITerminalChunk } from '@rushstack/terminal';

export interface IRequestEventSink extends _IOperationGraphEventSink {
  onIterationScheduled(records: Iterable<IOperationExecutionResult>): void;
}

export class PhasedRequestEventMultiplexer implements _IOperationGraphEventSink {
  readonly #workspaceSink: _IOperationGraphEventSink | undefined;
  readonly #requestSinks: Set<IRequestEventSink> = new Set();

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

  public onIterationScheduled(records: Iterable<IOperationExecutionResult>): void {
    const executionResults: IOperationExecutionResult[] = [...records];
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
    let lines: string[] | undefined;
    const announce: (sink: _IOperationGraphEventSink) => void = (sink) => {
      if (sink.onIterationStarting) {
        sink.onIterationStarting(records, parallelism, quietMode);
      } else if (sink.onActivity) {
        lines ??= _formatIterationStartLines(getNonSilentOperationNames(records), parallelism, quietMode);
        for (const line of lines) {
          sink.onActivity(line);
        }
      }
    };
    if (this.#workspaceSink) {
      announce(this.#workspaceSink);
    }
    for (const requestSink of this.#requestSinks) {
      announce(requestSink);
    }
  }

  public onActivity(text: string, options?: _IOperationActivityOptions): void {
    this.#workspaceSink?.onActivity?.(text, options);
    for (const requestSink of this.#requestSinks) {
      requestSink.onActivity?.(text, options);
    }
  }
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
