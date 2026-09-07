// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { OperationStatus, type IOperationGraph, type Operation } from '@microsoft/rush-lib';
import type {
  IDaemonGraphInvalidations,
  IDaemonGraphOperation,
  IDaemonGraphSnapshotPayload
} from '@rushstack/rush-daemon-protocol';

import type { IWorkspaceSession } from './WorkspaceSession';
import type { IWorkspaceInvalidationSnapshot } from './WorkspaceInvalidationTracker';
import { getWorkspaceGenerationToken } from './WorkspaceGeneration';

const OBSERVERS: WeakMap<IOperationGraph, DaemonGraphObserver> = new WeakMap();
const TAP_NAME: string = 'RushDaemonGraphObserver';

/** One hook set per graph, retaining only status metadata and live subscriber callbacks. */
export class DaemonGraphObserver {
  readonly #statuses: Map<Operation, OperationStatus> = new Map();
  readonly #subscribers: Set<() => void> = new Set();
  #idleSequence: number = 0;

  public constructor(graph: IOperationGraph) {
    graph.hooks.onExecutionStatesUpdated.tap(TAP_NAME, (records) => {
      for (const record of records) this.#statuses.set(record.operation, record.status);
      this.#notify();
    });
    graph.hooks.onIterationScheduled.tap(TAP_NAME, (records) => {
      for (const [operation, record] of records) this.#statuses.set(operation, record.status);
      this.#notify();
    });
    graph.hooks.onInvalidateOperations.tap(TAP_NAME, (operations) => {
      for (const operation of operations) this.#statuses.set(operation, OperationStatus.Ready);
      this.#notify();
    });
    graph.hooks.onEnableStatesChanged.tap(TAP_NAME, () => this.#notify());
    graph.hooks.onGraphStateChanged.tap(TAP_NAME, () => this.#notify());
    graph.hooks.onIdle.tap(TAP_NAME, () => {
      this.#idleSequence++;
      this.#notify();
    });
  }

  public get idleSequence(): number {
    return this.#idleSequence;
  }

  public get subscriberCount(): number {
    return this.#subscribers.size;
  }

  public subscribe(notify: () => void): () => void {
    this.#subscribers.add(notify);
    return () => { this.#subscribers.delete(notify); };
  }

  public getOperations(graph: IOperationGraph): IDaemonGraphOperation[] {
    return Array.from(graph.operations, (operation) => ({
      operationId: operation.name,
      projectName: operation.associatedProject.packageName,
      phaseName: operation.associatedPhase.name,
      enabled: operation.enabled,
      status: this.#statuses.get(operation) ?? graph.resultByOperation.get(operation)?.status ?? null,
      dependencyIds: Array.from(operation.dependencies, (dependency) => dependency.name).sort()
    })).sort((a, b) => a.operationId.localeCompare(b.operationId));
  }

  #notify(): void {
    // Subscribers only wake their bounded observation loop; no I/O or user callbacks run in a native hook.
    for (const notify of this.#subscribers) notify();
  }
}

export function getDaemonGraphObserver(graph: IOperationGraph): DaemonGraphObserver {
  let observer: DaemonGraphObserver | undefined = OBSERVERS.get(graph);
  if (!observer) {
    observer = new DaemonGraphObserver(graph);
    OBSERVERS.set(graph, observer);
  }
  return observer;
}

export function snapshotDaemonGraph(session: IWorkspaceSession): IDaemonGraphSnapshotPayload['snapshot'] {
  const workspaceGeneration: string = getWorkspaceGenerationToken(session);
  const changes: IWorkspaceInvalidationSnapshot = session.invalidations.getSnapshot();
  const invalidations: IDaemonGraphInvalidations = {
    sequence: changes.sequence,
    changedPathCount: changes.changedPaths.length,
    hasUnknownChanges: changes.hasUnknownChanges,
    isWatcherHealthy: changes.isWatcherHealthy
  };
  const graph: IOperationGraph | undefined = session.operationGraph;
  if (!graph) return { initialized: false, invalidations, workspaceGeneration };
  return {
    initialized: true,
    workspaceGeneration,
    invalidations,
    operations: getDaemonGraphObserver(graph).getOperations(graph),
    status: graph.status,
    pauseNextIteration: graph.pauseNextIteration,
    hasScheduledIteration: graph.hasScheduledIteration
  };
}

/** A single dirty bit coalesces arbitrarily many changes while the consumer is backpressured. */
export class DaemonGraphChanges implements Disposable {
  readonly #unsubscribe: (() => void)[];
  readonly #signals: ReadonlyArray<AbortSignal>;
  #dirty: boolean = true;
  #disposed: boolean = false;
  #wake: (() => void) | undefined;

  public constructor(session: IWorkspaceSession, graph: IOperationGraph, signal: AbortSignal) {
    this.#signals = [signal, graph.abortController.signal];
    this.#unsubscribe = [
      getDaemonGraphObserver(graph).subscribe(this.#notify),
      session.invalidations.subscribe(this.#notify)
    ];
    for (const abortSignal of this.#signals) {
      abortSignal.addEventListener('abort', this.#abort, { once: true });
    }
    if (this.#signals.some((abortSignal) => abortSignal.aborted)) this[Symbol.dispose]();
  }

  public async nextAsync(): Promise<boolean> {
    if (!this.#dirty && !this.#disposed) {
      await new Promise<void>((resolve) => { this.#wake = resolve; });
    }
    this.#dirty = false;
    return !this.#disposed;
  }

  public [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    for (const signal of this.#signals) signal.removeEventListener('abort', this.#abort);
    this.#notify();
  }

  #abort = (): void => this[Symbol.dispose]();

  #notify = (): void => {
    this.#dirty = true;
    this.#wake?.();
    this.#wake = undefined;
  };
}
