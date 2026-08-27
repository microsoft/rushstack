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

  public onOperationRegistered(operationId: string, silent: boolean): void {
    this.#workspaceSink?.onOperationRegistered?.(operationId, silent);
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationRegistered?.(operationId, silent);
    }
  }

  public onOperationStatusChanged(
    result: IOperationExecutionResult,
    previousStatus: OperationStatus
  ): void {
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

  public onOperationChunk(operationId: string, chunk: ITerminalChunk): void {
    this.#workspaceSink?.onOperationChunk?.(operationId, chunk);
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationChunk?.(operationId, chunk);
    }
  }

  public onOperationStreamClosed(operationId: string): void {
    this.#workspaceSink?.onOperationStreamClosed?.(operationId);
    for (const requestSink of this.#requestSinks) {
      requestSink.onOperationStreamClosed?.(operationId);
    }
  }

  public onActivity(text: string, options?: _IOperationActivityOptions): void {
    this.#workspaceSink?.onActivity?.(text, options);
    for (const requestSink of this.#requestSinks) {
      requestSink.onActivity?.(text, options);
    }
  }
}
