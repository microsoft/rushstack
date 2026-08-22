// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IOperationExecutionResult,
  OperationStatus,
  _IOperationActivityOptions,
  _IOperationGraphEventSink
} from '@microsoft/rush-lib';
import type { ITerminalChunk } from '@rushstack/terminal';

export class PhasedRequestEventMultiplexer implements _IOperationGraphEventSink {
  readonly #workspaceSink: _IOperationGraphEventSink | undefined;
  #requestSink: _IOperationGraphEventSink | undefined;

  public constructor(workspaceSink: _IOperationGraphEventSink | undefined) {
    this.#workspaceSink = workspaceSink;
  }

  public subscribe(requestSink: _IOperationGraphEventSink): () => void {
    if (this.#requestSink) {
      throw new Error('A phased request event subscription is already active.');
    }
    this.#requestSink = requestSink;
    let subscribed: boolean = true;
    return () => {
      if (subscribed) {
        subscribed = false;
        if (this.#requestSink === requestSink) {
          this.#requestSink = undefined;
        }
      }
    };
  }

  public onOperationRegistered(operationId: string, silent: boolean): void {
    this.#workspaceSink?.onOperationRegistered?.(operationId, silent);
    this.#requestSink?.onOperationRegistered?.(operationId, silent);
  }

  public onOperationStatusChanged(
    result: IOperationExecutionResult,
    previousStatus: OperationStatus
  ): void {
    this.#workspaceSink?.onOperationStatusChanged?.(result, previousStatus);
    this.#requestSink?.onOperationStatusChanged?.(result, previousStatus);
  }

  public onOperationHeader(operationId: string, completed: number, total: number): void {
    this.#workspaceSink?.onOperationHeader?.(operationId, completed, total);
    this.#requestSink?.onOperationHeader?.(operationId, completed, total);
  }

  public onOperationChunk(operationId: string, chunk: ITerminalChunk): void {
    this.#workspaceSink?.onOperationChunk?.(operationId, chunk);
    this.#requestSink?.onOperationChunk?.(operationId, chunk);
  }

  public onOperationStreamClosed(operationId: string): void {
    this.#workspaceSink?.onOperationStreamClosed?.(operationId);
    this.#requestSink?.onOperationStreamClosed?.(operationId);
  }

  public onActivity(text: string, options?: _IOperationActivityOptions): void {
    this.#workspaceSink?.onActivity?.(text, options);
    this.#requestSink?.onActivity?.(text, options);
  }
}
