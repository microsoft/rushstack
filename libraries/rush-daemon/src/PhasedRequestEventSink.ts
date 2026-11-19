// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';

import type { IOperationExecutionResult, Operation, _IOperationGraphEventSink } from '@microsoft/rush-lib';
import { OperationStatus, _formatIterationStartLines } from '@microsoft/rush-lib';
import { getCommandExecution } from '@microsoft/rush-lib/lib/logic/operations/IncrementalExecutionState';
import type { ICommandExecution } from '@microsoft/rush-lib/lib/logic/operations/IncrementalExecutionState';
import {
  DAEMON_PROTOCOL_VERSION,
  RUSHD_OPERATION_HEADER,
  RUSHD_OPERATION_STREAM_CLOSED
} from '@rushstack/rush-daemon-protocol';
import type {
  DaemonEventType,
  IDaemonActivityPayload,
  IDaemonEventEnvelope,
  IDaemonEventScope,
  IDaemonOperationStatusChangedPayload
} from '@rushstack/rush-daemon-protocol';
import { TerminalChunkKind } from '@rushstack/terminal';
import type { ITerminalChunk } from '@rushstack/terminal';

import type { IEngineActivityOptions } from './EngineActivityOptions';
import type { IPhasedRequestClient } from './PhasedRequestClient';

const EVENT_SOURCE_PACKAGE: string = '@microsoft/rush-lib';
const EVENT_SOURCE_COMPONENT: string = 'OperationGraph';
const TEXT_ENCODER: InstanceType<typeof TextEncoder> = new TextEncoder();
// Mirrors rush-lib's TERMINAL_STATUSES, which is not part of its public API.
export const TERMINAL_OPERATION_STATUSES: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.Success,
  OperationStatus.SuccessWithWarning,
  OperationStatus.Skipped,
  OperationStatus.Blocked,
  OperationStatus.FromCache,
  OperationStatus.Failure,
  OperationStatus.NoOp,
  OperationStatus.Aborted
]);

/**
 * Which command produced an operation's result, for an operation that has an incremental command. Rush records
 * the command on the execution record, which is the result that the engine reports.
 */
function getCommandKind(result: IOperationExecutionResult): ICommandExecution['kind'] | undefined {
  const execution: ICommandExecution | undefined = getCommandExecution(result);
  return execution?.hasIncrementalCommand ? execution.kind : undefined;
}

interface IObservedOperationResult {
  readonly executionResult: IOperationExecutionResult;
  readonly status: OperationStatus;
}

interface IEventOptions {
  readonly required?: boolean;
  readonly scope?: IDaemonEventScope;
}

/** How a sink reports that a request which returns early on failure can have its result; see the constructor. */
export interface IEarlyFailureOptions {
  /** The operations whose results decide the request's outcome. */
  readonly targetOperationIds: ReadonlySet<string>;
  /** Receives the number of the client's operations, not counting silent ones, that are still unfinished. */
  readonly onSettled: (unfinishedOperations: number) => void;
}

function isFailedStatus(status: OperationStatus): boolean {
  return status === OperationStatus.Failure || status === OperationStatus.Blocked;
}

function hasCompletionEvent(record: IOperationExecutionResult): boolean {
  const completed: boolean | undefined = (record as { readonly isOperationCompleted?: boolean })
    .isOperationCompleted;
  return completed ?? TERMINAL_OPERATION_STATUSES.has(record.status);
}

class OrderedClientWriter {
  readonly #client: IPhasedRequestClient;
  readonly #onFailure: (error: Error) => void;
  #failure: Error | undefined;
  #tail: Promise<void> = Promise.resolve();

  public constructor(client: IPhasedRequestClient, onFailure: (error: Error) => void) {
    this.#client = client;
    this.#onFailure = onFailure;
  }

  public writeEvent(createEvent: () => IDaemonEventEnvelope): void {
    this.#enqueue(() => this.#client.writeEventAsync(createEvent()));
  }

  public writeLogChunk(operationId: string, stream: 'stdout' | 'stderr', chunk: Uint8Array): void {
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
        this.#onFailure(this.#failure);
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
  readonly #onActiveOperationsSettled: (() => void) | undefined;
  readonly #earlyFailure: IEarlyFailureOptions | undefined;
  readonly #pendingOperationIds: Set<string> = new Set();
  /** The current iteration's records of this client's operations; their statuses change as the iteration runs. */
  readonly #scheduledResults: Map<Operation, IOperationExecutionResult> = new Map();
  #activeOperationsSettled: boolean = false;
  #completedOperations: number = 0;
  #failed: boolean = false;
  #earlyFailureOffered: boolean = false;
  #settled: boolean = false;
  #totalOperations: number = 0;

  public constructor(options: {
    activeOperationIds: ReadonlySet<string>;
    client: IPhasedRequestClient;
    getNextSequence: () => number;
    onWriteFailure: (error: Error) => void;
    rushVersion: string;
    /**
     * Called at most once per iteration, when every operation of this client's selection that the iteration
     * scheduled has emitted its terminal completion event. All of those operations' events and log chunks are
     * enqueued on this sink's writer before the callback runs.
     */
    onActiveOperationsSettled?: () => void;
    /**
     * For a request that returns early on failure: `onSettled` is called at most once per iteration, after any
     * operation's completion event, when one of this client's operations failed or was blocked, none was aborted,
     * none of the targets is unfinished, and `onActiveOperationsSettled` was not called.
     */
    earlyFailure?: IEarlyFailureOptions;
  }) {
    this.#activeOperationIds = options.activeOperationIds;
    this.#client = options.client;
    this.#getNextSequence = options.getNextSequence;
    this.#onActiveOperationsSettled = options.onActiveOperationsSettled;
    this.#earlyFailure = options.earlyFailure;
    this.#rushVersion = options.rushVersion;
    this.#writer = new OrderedClientWriter(options.client, options.onWriteFailure);
  }

  /** Whether `onActiveOperationsSettled` was called for the current iteration. */
  public get activeOperationsSettled(): boolean {
    return this.#activeOperationsSettled;
  }

  public getObservedResult(operation: Operation): IObservedOperationResult | undefined {
    return this.#observedResults.get(operation);
  }

  /** The current iteration's record of one of this client's operations, with its current status. */
  public getScheduledResult(operation: Operation): IOperationExecutionResult | undefined {
    return this.#scheduledResults.get(operation);
  }

  /**
   * The names of this client's operations, not counting silent ones, that the current iteration has not finished.
   * The records' statuses change as the iteration runs, so this is current even after the client unsubscribed.
   */
  public getUnfinishedOperationNames(): string[] {
    const names: string[] = [];
    for (const record of this.#scheduledResults.values()) {
      if (!record.silent && !TERMINAL_OPERATION_STATUSES.has(record.status)) {
        names.push(record.operation.name);
      }
    }
    return names;
  }

  public flushAsync(): Promise<void> {
    return this.#writer.flushAsync();
  }

  public onOperationRegistered(operationId: string, silent: boolean): void {
    if (this.#activeOperationIds.has(operationId)) {
      this.#emitEvent('operationRegistered', { operationId, silent });
    }
  }

  public onIterationScheduled(records: Iterable<IOperationExecutionResult>): void {
    this.#completedOperations = 0;
    this.#totalOperations = 0;
    this.#pendingOperationIds.clear();
    this.#scheduledResults.clear();
    this.#failed = false;
    this.#activeOperationsSettled = false;
    this.#earlyFailureOffered = false;
    this.#settled = false;
    for (const record of records) {
      const operationId: string = record.operation.name;
      if (!this.#activeOperationIds.has(operationId)) {
        continue;
      }
      this.#scheduledResults.set(record.operation, record);
      this.#failed ||= isFailedStatus(record.status);
      if (!record.silent) {
        this.#totalOperations++;
      }
      if (!hasCompletionEvent(record)) {
        this.#pendingOperationIds.add(operationId);
      }
    }
  }

  /**
   * Announces the iteration to this client with only its own operations, as the iteration would be announced if
   * the client's request were the only one in it.
   */
  public onIterationStarting(
    records: ReadonlyArray<IOperationExecutionResult>,
    parallelism: number,
    quietMode: boolean
  ): void {
    const operationNames: string[] = [];
    for (const record of records) {
      const operationId: string = record.operation.name;
      if (!record.silent && this.#activeOperationIds.has(operationId)) {
        operationNames.push(operationId);
      }
    }
    if (operationNames.length === 0) {
      // Alone, a request with nothing to run starts no iteration, so it is not announced.
      return;
    }
    for (const line of _formatIterationStartLines(operationNames, parallelism, quietMode)) {
      this.onActivity(line);
    }
  }

  public onOperationCompleted(result: IOperationExecutionResult): void {
    this.#settleActiveOperation(result);
    // A failure elsewhere can block this client's operations, so any operation's completion can decide its result.
    this.#offerEarlyFailure();
  }

  /**
   * For a sink that subscribed to an iteration that was already executing: settles it if none of its client's
   * operations is unfinished, as the completion of its last one would, and otherwise offers a failed request's
   * result. Completion events settle it later as they settle any sink.
   */
  public settleIfIdle(): void {
    if (!this.#settled && this.#pendingOperationIds.size === 0) {
      for (const record of this.#scheduledResults.values()) {
        if (record.status === OperationStatus.Aborted) {
          // The iteration is being aborted; leave this client's result to the batch.
          this.#settled = true;
          return;
        }
      }
      this.#settle();
      return;
    }
    this.#offerEarlyFailure();
  }

  /**
   * Offers a failed request's result again if it was offered, because the router may now accept an offer that it
   * declined, for example once another request joined the iteration.
   */
  public reofferEarlyFailure(): void {
    if (this.#earlyFailureOffered && !this.#settled) {
      this.#earlyFailureOffered = false;
      this.#offerEarlyFailure();
    }
  }

  public onOperationStatusChanged(result: IOperationExecutionResult, previousStatus: OperationStatus): void {
    const operationId: string = result.operation.name;
    if (!this.#activeOperationIds.has(operationId)) {
      return;
    }
    this.#observedResults.set(result.operation, {
      executionResult: result,
      status: result.status
    });
    this.#failed ||= isFailedStatus(result.status);
    // Summarizing clients (agent output) point at the full log of the operations that explain a failure, and say
    // whether their incremental command ran, which can fail where their initial command would not.
    const isProblem: boolean =
      result.status === OperationStatus.Failure || result.status === OperationStatus.SuccessWithWarning;
    const logFilePath: string | undefined = isProblem ? result.logFilePaths?.text : undefined;
    const commandKind: ICommandExecution['kind'] | undefined = isProblem ? getCommandKind(result) : undefined;
    const payload: IDaemonOperationStatusChangedPayload = {
      operationId,
      previousStatus,
      status: result.status,
      ...(logFilePath ? { logFilePath } : {}),
      ...(commandKind ? { commandKind } : {})
    };
    this.#emitEvent('operationStatusChanged', payload);
  }

  public onOperationHeader(operationId: string): void {
    if (this.#activeOperationIds.has(operationId)) {
      this.#completedOperations++;
      this.#emitEvent(
        'extension',
        {
          data: {
            completedOperations: this.#completedOperations,
            operationId,
            totalOperations: this.#totalOperations
          },
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
    const stream: 'stdout' | 'stderr' = chunk.kind === TerminalChunkKind.Stderr ? 'stderr' : 'stdout';
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

  public onActivity(text: string, options?: IEngineActivityOptions): void {
    const operationId: string | undefined = options?.operationId;
    if (operationId !== undefined && !this.#activeOperationIds.has(operationId)) {
      return;
    }
    const payload: IDaemonActivityPayload = {
      stream: options?.stderr === true ? 'stderr' : 'stdout',
      text,
      ...(options?.severity === undefined ? undefined : { severity: options.severity })
    };
    this.#emitEvent('activityChanged', payload, {
      required: true,
      scope: operationId === undefined ? undefined : { operationId }
    });
  }

  #settleActiveOperation(result: IOperationExecutionResult): void {
    if (!this.#pendingOperationIds.delete(result.operation.name) || this.#settled) {
      return;
    }
    if (result.status === OperationStatus.Aborted) {
      // The iteration is being aborted or failed to start; leave this client's result to the batch.
      this.#settled = true;
      return;
    }
    if (this.#pendingOperationIds.size === 0) {
      this.#settle();
    }
  }

  #settle(): void {
    this.#settled = true;
    this.#activeOperationsSettled = true;
    this.#onActiveOperationsSettled?.();
  }

  /**
   * Offers a failed request's result once nothing that is unfinished can change it. Blocked operations emit their
   * completion events only when the iteration ends, so this reads the records' current statuses instead.
   */
  #offerEarlyFailure(): void {
    if (!this.#earlyFailure || !this.#failed || this.#settled || this.#earlyFailureOffered) {
      return;
    }
    const { targetOperationIds, onSettled } = this.#earlyFailure;
    let unfinishedOperations: number = 0;
    for (const record of this.#scheduledResults.values()) {
      if (record.status === OperationStatus.Aborted) {
        return;
      }
      if (!TERMINAL_OPERATION_STATUSES.has(record.status)) {
        if (targetOperationIds.has(record.operation.name)) {
          return;
        }
        if (!record.silent) {
          unfinishedOperations++;
        }
      }
    }
    this.#earlyFailureOffered = true;
    onSettled(unfinishedOperations);
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
