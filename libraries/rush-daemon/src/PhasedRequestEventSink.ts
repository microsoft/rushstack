// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';

import type {
  IOperationExecutionResult,
  Operation,
  OperationStatus,
  _IOperationActivityOptions,
  _IOperationGraphEventSink
} from '@microsoft/rush-lib';
import {
  DAEMON_PROTOCOL_VERSION,
  RUSHD_OPERATION_HEADER,
  RUSHD_OPERATION_STREAM_CLOSED
} from '@rushstack/rush-daemon-protocol';
import type {
  DaemonEventType,
  IDaemonEventEnvelope,
  IDaemonEventScope
} from '@rushstack/rush-daemon-protocol';
import { TerminalChunkKind } from '@rushstack/terminal';
import type { ITerminalChunk } from '@rushstack/terminal';

import type { IPhasedRequestClient } from './PhasedRequestClient';

const EVENT_SOURCE_PACKAGE: string = '@microsoft/rush-lib';
const EVENT_SOURCE_COMPONENT: string = 'OperationGraph';
const TEXT_ENCODER: InstanceType<typeof TextEncoder> = new TextEncoder();

interface IObservedOperationResult {
  readonly executionResult: IOperationExecutionResult;
  readonly status: string;
}

interface IEventOptions {
  readonly required?: boolean;
  readonly scope?: IDaemonEventScope;
}

class OrderedClientWriter {
  readonly #client: IPhasedRequestClient;
  readonly #onFailure: () => void;
  #failure: Error | undefined;
  #tail: Promise<void> = Promise.resolve();

  public constructor(client: IPhasedRequestClient, onFailure: () => void) {
    this.#client = client;
    this.#onFailure = onFailure;
  }

  public writeEvent(createEvent: () => IDaemonEventEnvelope): void {
    this.#enqueue(() => this.#client.writeEventAsync(createEvent()));
  }

  public writeLogChunk(
    operationId: string,
    stream: 'stdout' | 'stderr',
    chunk: Uint8Array
  ): void {
    this.#enqueue(() => this.#client.writeLogChunkAsync(operationId, stream, chunk));
  }

  public async flushAsync(): Promise<void> {
    await this.#tail;
    if (this.#failure) {
      throw this.#failure;
    }
  }

  #enqueue(writeAsync: () => Promise<void>): void {
    this.#tail = this.#tail.then(async () => {
      if (this.#failure) {
        return;
      }
      try {
        await writeAsync();
      } catch (error) {
        this.#failure = error instanceof Error ? error : new Error(String(error));
        this.#onFailure();
      }
    });
  }
}

export class PhasedRequestEventSink implements _IOperationGraphEventSink {
  readonly #activeOperationIds: ReadonlySet<string>;
  readonly #client: IPhasedRequestClient;
  readonly #getNextSequence: () => number;
  readonly #observedResults: Map<Operation, IObservedOperationResult> = new Map();
  readonly #rushVersion: string;
  readonly #writer: OrderedClientWriter;

  public constructor(options: {
    activeOperationIds: ReadonlySet<string>;
    client: IPhasedRequestClient;
    getNextSequence: () => number;
    onWriteFailure: () => void;
    rushVersion: string;
  }) {
    this.#activeOperationIds = options.activeOperationIds;
    this.#client = options.client;
    this.#getNextSequence = options.getNextSequence;
    this.#rushVersion = options.rushVersion;
    this.#writer = new OrderedClientWriter(options.client, options.onWriteFailure);
  }

  public getObservedResult(operation: Operation): IObservedOperationResult | undefined {
    return this.#observedResults.get(operation);
  }

  public flushAsync(): Promise<void> {
    return this.#writer.flushAsync();
  }

  public onOperationRegistered(operationId: string, silent: boolean): void {
    if (this.#activeOperationIds.has(operationId)) {
      this.#emitEvent('operationRegistered', { operationId, silent });
    }
  }

  public onOperationStatusChanged(
    result: IOperationExecutionResult,
    previousStatus: OperationStatus
  ): void {
    const operationId: string = result.operation.name;
    if (!this.#activeOperationIds.has(operationId)) {
      return;
    }
    this.#observedResults.set(result.operation, {
      executionResult: result,
      status: result.status
    });
    this.#emitEvent('operationStatusChanged', {
      operationId,
      previousStatus,
      status: result.status
    });
  }

  public onOperationHeader(operationId: string, completed: number, total: number): void {
    if (this.#activeOperationIds.has(operationId)) {
      this.#emitEvent(
        'extension',
        {
          data: { completedOperations: completed, operationId, totalOperations: total },
          name: RUSHD_OPERATION_HEADER
        },
        { required: true }
      );
    }
  }

  public onOperationChunk(operationId: string, chunk: ITerminalChunk): void {
    if (!this.#activeOperationIds.has(operationId)) {
      return;
    }
    const stream: 'stdout' | 'stderr' =
      chunk.kind === TerminalChunkKind.Stderr ? 'stderr' : 'stdout';
    this.#writer.writeLogChunk(operationId, stream, TEXT_ENCODER.encode(chunk.text));
  }

  public onOperationStreamClosed(operationId: string): void {
    if (this.#activeOperationIds.has(operationId)) {
      this.#emitEvent(
        'extension',
        {
          data: { operationId },
          name: RUSHD_OPERATION_STREAM_CLOSED
        },
        { required: true }
      );
    }
  }

  public onActivity(text: string, options?: _IOperationActivityOptions): void {
    const operationId: string | undefined = options?.operationId;
    if (operationId !== undefined && !this.#activeOperationIds.has(operationId)) {
      return;
    }
    this.#emitEvent(
      'activityChanged',
      { stream: options?.stderr === true ? 'stderr' : 'stdout', text },
      { required: true, scope: operationId === undefined ? undefined : { operationId } }
    );
  }

  #emitEvent(type: DaemonEventType, payload: unknown, options?: IEventOptions): void {
    this.#writer.writeEvent(() => ({
      eventId: randomUUID(),
      payload,
      privacy: 'public',
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      required: options?.required ?? false,
      scope: options?.scope,
      sequence: this.#getNextSequence(),
      sessionId: this.#client.sessionId,
      source: {
        component: EVENT_SOURCE_COMPONENT,
        packageName: EVENT_SOURCE_PACKAGE,
        packageVersion: this.#rushVersion
      },
      timestamp: new Date().toISOString(),
      type
    }));
  }
}
