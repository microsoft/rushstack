// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IOperationExecutionResult,
  OperationStatus,
  _IOperationActivityOptions,
  _IOperationGraphEventSink
} from '@microsoft/rush-lib';
import type { ITerminalChunk } from '@rushstack/terminal';

interface IRequestEventSink extends _IOperationGraphEventSink {
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

  public onOperationRegistered(operationId: string, silent: boolean, iterationId: number): void {
    this.#workspaceSink?.onOperationRegistered?.(operationId, silent, iterationId);
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationRegistered?.(operationId, silent, iterationId);
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

  public onOperationChunk(operationId: string, chunk: ITerminalChunk, iterationId: number): void {
    this.#workspaceSink?.onOperationChunk?.(operationId, chunk, iterationId);
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationChunk?.(operationId, chunk, iterationId);
    }
  }

  public onOperationStreamClosed(operationId: string, iterationId: number): void {
    this.#workspaceSink?.onOperationStreamClosed?.(operationId, iterationId);
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationStreamClosed?.(operationId, iterationId);
    }
  }

  public onOperationCompleted(result: IOperationExecutionResult): void {
    this.#workspaceSink?.onOperationCompleted?.(result);
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationCompleted?.(result);
    }
  }

  public onActivity(text: string, options?: _IOperationActivityOptions): void {
    this.#workspaceSink?.onActivity?.(text, options);
    for (const requestSink of this.#requestSinks) {
      requestSink.onActivity?.(text, options);
    }
  }
}
