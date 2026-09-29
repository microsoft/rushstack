// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IOperationExecutionResult,
  IOperationGraph,
  IOperationGraphExtensionResult,
  Operation
} from '@microsoft/rush-lib';
import { EnvironmentVariableNames, OperationStatus } from '@microsoft/rush-lib';
import type { IDaemonPhasedRequestResult } from '@rushstack/rush-daemon-protocol';

import type { PhasedIterationDemand } from './PhasedIterationDemand';
import type { IRequestEventSink, PhasedRequestEventMultiplexer } from './PhasedRequestEventMultiplexer';
import type { PhasedRequestEventSink } from './PhasedRequestEventSink';
import type {
  IBatchEntry,
  IBatchTimings,
  INewBatchEntry,
  IPreparedPhasedRequest,
  IResolvedSelection
} from './PhasedRequestRouter';
import { RequestExclusivityClass } from './RequestScheduler';
import type { IWorkspaceInvalidationPeek } from './WorkspaceEngineComponentFactory';
import type { RequestAdmissionController } from './WorkspaceRequestAdmission';
import type { IWorkspaceSession } from './WorkspaceSession';

/**
 * A request that joined the executing iteration, or that failed as it was about to; an object, so that awaiting it
 * does not await its result.
 */
export interface IJoinedRequest {
  readonly resultPromise: Promise<IDaemonPhasedRequestResult>;
  /** Why the request failed before it joined, if it did. */
  readonly failure?: string;
}

/** What a request that joins the executing iteration needs of its batch, once the iteration is scheduled. */
export interface IJoinableBatch {
  /** The batch's entries; a request that joins is added to them. */
  readonly batch: IBatchEntry[];
  readonly demand: PhasedIterationDemand;
  /** The participants that the iteration's operations are attributed to; see `addOperationParticipant`. */
  readonly entryByOperation: Map<Operation, IBatchEntry>;
  /** The timings of the requests that joined, whose iteration ends with the batch's. */
  readonly joinedTimings: IBatchTimings[];
  /** The batch's participants; a request that joins is added to them. */
  readonly participants: IBatchEntry[];
  readonly timings: IBatchTimings;
}

/** The handling of batches and their entries that `PhasedIterationJoiner` shares with the batch coordinator. */
export interface IPhasedIterationJoinHost {
  readonly graph: IOperationGraph;
  readonly multiplexer: PhasedRequestEventMultiplexer;
  readonly workspaceSession: IWorkspaceSession;
  /** Enables the operations of the selections, and disables the other operations. */
  applySelections(selections: ReadonlyArray<IResolvedSelection>): void;
  createEntry(
    request: IPreparedPhasedRequest,
    admissionController: RequestAdmissionController
  ): INewBatchEntry;
  createRequestSink(entry: IBatchEntry): PhasedRequestEventSink;
  /** Produces the failed result of an entry whose execution could not start. */
  failEntry(entry: IBatchEntry, error: unknown): void;
  /** Publishes the result of a participant whose operations are done, if another participant needs the iteration. */
  finishSettledEntry(entry: IBatchEntry): void;
  /** Whether a live participant still needs the current batch's iteration. */
  hasLiveParticipant(): boolean;
  /** Whether another request waits for the graph. */
  hasWaitingRequest(): boolean;
  /** Lets the client of a participant cancel its request. */
  listenForCancellation(entry: IBatchEntry): void;
  /** Whether a live participant still waits for the iteration to produce its result, or continues until it ends. */
  needsIteration(entry: IBatchEntry): boolean;
  /** Narrows the iteration to the operations that its live participants need. */
  restrictBatchDemand(): void;
}

/**
 * The iteration of a shared-build batch that holds the operations that none of its participants needs, so that a
 * compatible request that arrives while the iteration executes can add its work to it; see `PhasedIterationJoiner`.
 */
export class JoinableIteration implements IRequestEventSink {
  public readonly requestSettingsKey: string;
  /** Resolves with true once the iteration dispatches an operation, or with false if the batch ends before. */
  public readonly dispatching: Promise<boolean>;
  public batch: IJoinableBatch | undefined;
  public records: ReadonlyMap<Operation, IOperationExecutionResult> | undefined;
  readonly #resolveDispatching: (dispatched: boolean) => void;
  #dispatched: boolean = false;

  public constructor(requestSettingsKey: string) {
    this.requestSettingsKey = requestSettingsKey;
    let resolveDispatching: ((dispatched: boolean) => void) | undefined;
    this.dispatching = new Promise<boolean>((resolve: (dispatched: boolean) => void) => {
      resolveDispatching = resolve;
    });
    this.#resolveDispatching = resolveDispatching!;
  }

  public get dispatched(): boolean {
    return this.#dispatched;
  }

  public onIterationScheduled(records: Iterable<IOperationExecutionResult>): void {
    this.records = new Map(
      Array.from(records, (record: IOperationExecutionResult) => [record.operation, record] as const)
    );
  }

  public onOperationStatusChanged(record: IOperationExecutionResult): void {
    // The graph queues an operation only once its iteration dispatches operations.
    if (record.status === OperationStatus.Queued && !this.#dispatched) {
      this.#dispatched = true;
      this.#resolveDispatching(true);
    }
  }

  public end(): void {
    this.#resolveDispatching(false);
  }
}

/**
 * Adds the work of a shared-build request that arrives while the current batch's iteration executes to that
 * iteration, so that the request does not wait for the iteration to end. Experimental; only if the daemon
 * configuration of the workspace session enables `joinRunningBatch` (`RUSH_DAEMON_JOIN_RUNNING_BATCH=1`).
 *
 * @remarks
 * The request must have the batch's request settings, and it joins only while no other request waits for the
 * graph, so that joining requests never keep a waiting request from running. Unless its admission limits its
 * wait, it first waits for the iteration to dispatch operations, which the batch starts after its reconcile.
 * Then the graph holds the operations that no participant needs while the inputs are read again, and adds the
 * request's work to the iteration under those inputs (`tryExtendCurrentIteration`). If it cannot, for example
 * because an operation that the request needs started before its inputs changed, nothing changes and the request
 * waits for the iteration to end as before.
 *
 * A request that joins takes part in the batch like any participant: its result comes as soon as its own
 * operations are done while other participants still need the iteration. A participant whose operations were
 * already done gets its result when a request joins, instead of when the joined work is done. The request does not
 * receive the output that operations wrote before it joined.
 */
export class PhasedIterationJoiner {
  readonly #host: IPhasedIterationJoinHost;
  /** The current batch's iteration while requests may join it. */
  #joinable: JoinableIteration | undefined;
  /** Requests join the executing iteration one at a time. */
  #joinTail: Promise<void> = Promise.resolve();

  public constructor(host: IPhasedIterationJoinHost) {
    this.#host = host;
  }

  /**
   * Lets requests join the iteration of the batch that starts with `first`, if they can, and returns the state that
   * the batch completes once it schedules the iteration. Requests received after the batch's reconcile starts can no
   * longer join the batch before it executes, so they may wait for its iteration to execute and join it then.
   */
  public open(first: IBatchEntry): JoinableIteration | undefined {
    const joinable: JoinableIteration | undefined = this.#canJoin(first)
      ? new JoinableIteration(first.requestSettingsKey)
      : undefined;
    this.#joinable = joinable;
    return joinable;
  }

  /** Ends the requests' joining of the iteration; a request that waits for it to start waits for it to end. */
  public close(joinable: JoinableIteration | undefined): void {
    if (joinable && this.#joinable === joinable) {
      this.#joinable = undefined;
    }
    joinable?.end();
  }

  /**
   * Returns the request if it joined, or failed as it was about to, or undefined if it waits for the iteration to end
   * as before.
   */
  public async tryJoinAsync(
    request: IPreparedPhasedRequest,
    admissionController: RequestAdmissionController
  ): Promise<IJoinedRequest | undefined> {
    const joinable: JoinableIteration | undefined = this.#joinable;
    if (
      !joinable ||
      request.exclusivityClass !== RequestExclusivityClass.SharedBuild ||
      request.requestSettingsKey !== joinable.requestSettingsKey
    ) {
      return undefined;
    }
    const attemptStartTimeMs: number = performance.now();
    const previousJoin: Promise<void> = this.#joinTail;
    let endJoin: () => void = () => undefined;
    this.#joinTail = new Promise<void>((resolve: () => void) => {
      endJoin = resolve;
    });
    let outcome: IJoinedRequest | string;
    try {
      await previousJoin;
      if (!joinable.dispatched && !mayWaitForDispatch(request)) {
        outcome = 'the iteration has not started, and the request limits its wait';
      } else if (!joinable.dispatched && !(await joinable.dispatching)) {
        outcome = 'the iteration ended before it started';
      } else {
        outcome = await this.#joinAsync(joinable, request, admissionController);
      }
    } catch (error) {
      // Once the request joined, `#extendIteration` handles failures itself, so the request did not join, and it
      // waits for the iteration to end as before.
      outcome = `joining failed: ${getErrorMessage(error)}`;
    } finally {
      endJoin();
    }
    logJoinAttempt(request.request.requestId, outcome, attemptStartTimeMs);
    return typeof outcome === 'string' ? undefined : outcome;
  }

  #canJoin(first: IBatchEntry): boolean {
    const { graph, workspaceSession } = this.#host;
    return (
      workspaceSession.rushConfiguration.daemon.joinRunningBatch &&
      // A cobuild can hand an operation back to the queue, which adding work to the iteration does not expect.
      !process.env[EnvironmentVariableNames.RUSH_COBUILD_CONTEXT_ID] &&
      first.exclusivityClass === RequestExclusivityClass.SharedBuild &&
      first.requestSettings?.isIncrementalBuildAllowed !== false &&
      graph.tryExtendCurrentIteration !== undefined &&
      graph.retainHeldOperations !== undefined &&
      workspaceSession.peekInvalidationsAsync !== undefined
    );
  }

  /** Returns the joined request, or why the request did not join. */
  async #joinAsync(
    joinable: JoinableIteration,
    request: IPreparedPhasedRequest,
    admissionController: RequestAdmissionController
  ): Promise<IJoinedRequest | string> {
    const startTimeMs: number = performance.now();
    const refusal: string | undefined = this.#getRefusal(joinable, request);
    if (refusal !== undefined) {
      return refusal;
    }
    // Operations that no participant needs would otherwise start while the inputs are read, and could then no
    // longer do the request's work.
    const endRetention: (() => void) | undefined = this.#host.graph.retainHeldOperations?.();
    if (!endRetention) {
      return 'the iteration holds no operations';
    }
    try {
      const reconcileStartTimeMs: number = performance.now();
      let peek: IWorkspaceInvalidationPeek | undefined;
      try {
        peek = await this.#host.workspaceSession.peekInvalidationsAsync?.({
          executingIterationRecords: joinable.records!
        });
      } catch (error) {
        return `reading the inputs failed: ${getErrorMessage(error)}`;
      }
      if (!peek) {
        return 'the changed inputs cannot be added to an executing iteration';
      }
      const timings: IBatchTimings = {
        startTimeMs,
        joinedIteration: true,
        batchSize: 0,
        leasesAcquiredTimeMs: undefined,
        reconcileStartTimeMs,
        reconciledTimeMs: performance.now(),
        selectionsAppliedTimeMs: undefined,
        scheduleStartTimeMs: undefined,
        scheduledTimeMs: undefined,
        executionStartTimeMs: undefined,
        iterationEndTimeMs: undefined
      };
      return this.#extendIteration(joinable, request, admissionController, peek, timings);
    } finally {
      endRetention();
    }
  }

  /** Adds the request's work to the executing iteration, and commits or discards `peek`. */
  #extendIteration(
    joinable: JoinableIteration,
    request: IPreparedPhasedRequest,
    admissionController: RequestAdmissionController,
    peek: IWorkspaceInvalidationPeek,
    timings: IBatchTimings
  ): IJoinedRequest | string {
    const refusal: string | undefined = this.#getRefusal(joinable, request);
    const batch: IJoinableBatch | undefined = joinable.batch;
    if (refusal !== undefined || !batch) {
      peek.discard();
      return refusal ?? 'the iteration ended';
    }
    const host: IPhasedIterationJoinHost = this.#host;
    const { entry, resultPromise } = host.createEntry(request, admissionController);
    try {
      // As a batch does before it schedules its iteration, so that none of the request's work starts if it throws.
      // If the iteration then cannot take the work, the batch that later runs the request calls it again.
      entry.onExecutionStarting?.();
    } catch (error) {
      peek.discard();
      host.failEntry(entry, error);
      return { resultPromise, failure: `its execution could not start: ${getErrorMessage(error)}` };
    }
    const extensionRefusal: string | undefined = this.#addToIteration(batch, entry, peek, timings);
    if (extensionRefusal !== undefined) {
      return extensionRefusal;
    }
    timings.scheduledTimeMs = timings.executionStartTimeMs = performance.now();
    entry.executionStarted = true;
    try {
      peek.commit();
      entry.requestSink = host.createRequestSink(entry);
      entry.unsubscribe = host.multiplexer.subscribeToCurrentIteration(entry.requestSink);
    } catch (error) {
      entry.unsubscribe?.();
      entry.unsubscribe = undefined;
      entry.requestSink = undefined;
      // The request's work is in the iteration, but no participant needs it.
      host.restrictBatchDemand();
      // A later participant that needs the work that did not start runs it in its own environment.
      removeUndispatchedAttributions(batch.entryByOperation, entry, joinable.records!);
      host.failEntry(entry, error);
      return { resultPromise };
    }
    entry.participated = true;
    entry.batchTimings = timings;
    batch.batch.push(entry);
    batch.participants.push(entry);
    batch.joinedTimings.push(timings);
    for (const batchTimings of [batch.timings, ...batch.joinedTimings]) {
      batchTimings.batchSize = batch.participants.length;
    }
    host.listenForCancellation(entry);
    if (batch.demand.restricted) {
      host.restrictBatchDemand();
    }
    for (const participant of batch.participants) {
      if (participant === entry || participant.finishPromise !== undefined) {
        continue;
      }
      // A participant whose result was ready waited for the iteration to end only because no other participant
      // needed the iteration.
      if (participant.requestSink?.activeOperationsSettled) {
        host.finishSettledEntry(participant);
      } else {
        participant.requestSink?.reofferEarlyFailure();
      }
    }
    entry.requestSink.settleIfIdle();
    return { resultPromise };
  }

  /**
   * Enables the entry's operations and adds them to the executing iteration under the inputs of `peek`. If the
   * iteration cannot take them, restores the graph, discards `peek` and returns why.
   */
  #addToIteration(
    batch: IJoinableBatch,
    entry: IBatchEntry,
    peek: IWorkspaceInvalidationPeek,
    timings: IBatchTimings
  ): string | undefined {
    const { graph, multiplexer } = this.#host;
    const enabledStates: ReadonlyMap<Operation, Operation['enabled']> = new Map(
      Array.from(graph.operations, (operation: Operation) => [operation, operation.enabled] as const)
    );
    const attributedOperations: ReadonlyArray<Operation> = addOperationParticipant(
      batch.entryByOperation,
      entry
    );
    let extension: IOperationGraphExtensionResult | undefined;
    try {
      // Work that only departed participants needed stays withheld; see `restrictBatchDemand`.
      this.#host.applySelections([
        ...batch.participants
          .filter((participant: IBatchEntry) => this.#host.needsIteration(participant))
          .map((participant: IBatchEntry) => participant.selection),
        entry.selection
      ]);
      timings.selectionsAppliedTimeMs = timings.scheduleStartTimeMs = performance.now();
      // The joining request's reconcile invalidates retained results of earlier iterations, which the request sinks
      // do not observe, as they do not observe the reconcile before an iteration.
      extension = multiplexer.runForIterationRecords(() =>
        graph.tryExtendCurrentIteration!({
          inputsSnapshot: peek.inputsSnapshot,
          neededOperations: entry.selection.activeOperations,
          invalidatedOperations: peek.invalidatedOperations,
          invalidationReason: peek.invalidationReason
        })
      );
    } catch (error) {
      extension = {
        extended: false,
        reason: `extending the iteration failed: ${getErrorMessage(error)}`,
        changedOperations: new Set()
      };
    } finally {
      if (!extension?.extended) {
        peek.discard();
        for (const operation of attributedOperations) {
          batch.entryByOperation.delete(operation);
        }
        restoreEnabledStates(graph, enabledStates);
      }
    }
    return extension.extended ? undefined : (extension.reason ?? 'the iteration was not extended');
  }

  /** Returns why the request cannot join the executing iteration now, or undefined if it can. */
  #getRefusal(joinable: JoinableIteration, request: IPreparedPhasedRequest): string | undefined {
    if (this.#joinable !== joinable || !joinable.batch || !joinable.records) {
      return 'the iteration ended';
    }
    if (request.client.abortSignal.aborted) {
      return 'the request was cancelled';
    }
    if (this.#host.hasWaitingRequest()) {
      return 'another request waits for the graph';
    }
    if (joinable.batch.demand.abandoned || !this.#host.hasLiveParticipant()) {
      return 'no participant needs the iteration';
    }
    return undefined;
  }
}

/**
 * Attributes the operations of a participant's selection that no earlier participant's selection includes to the
 * participant, and returns them.
 */
export function addOperationParticipant(
  entryByOperation: Map<Operation, IBatchEntry>,
  entry: IBatchEntry
): Operation[] {
  const attributedOperations: Operation[] = [];
  for (const operation of entry.selection.activeOperations) {
    if (!entryByOperation.has(operation)) {
      entryByOperation.set(operation, entry);
      attributedOperations.push(operation);
    }
  }
  return attributedOperations;
}

/** Removes the entry's attribution of the operations that the graph has not handed to an execution slot yet. */
function removeUndispatchedAttributions(
  entryByOperation: Map<Operation, IBatchEntry>,
  entry: IBatchEntry,
  records: ReadonlyMap<Operation, IOperationExecutionResult>
): void {
  for (const [operation, participant] of entryByOperation) {
    const status: OperationStatus | undefined = records.get(operation)?.status;
    if (participant === entry && (status === OperationStatus.Waiting || status === OperationStatus.Ready)) {
      entryByOperation.delete(operation);
    }
  }
}

/**
 * Whether a request may wait for an iteration to dispatch operations in order to join it: unless the request limits
 * its wait, it would wait for the graph anyway.
 */
function mayWaitForDispatch(request: IPreparedPhasedRequest): boolean {
  const { admission } = request.request;
  return (
    admission?.noWait !== true &&
    (admission?.waitTimeoutMs === undefined || admission.waitTimeoutIsDefault === true)
  );
}

function logJoinAttempt(requestId: string, outcome: IJoinedRequest | string, startTimeMs: number): void {
  const durationMs: number = Math.round(performance.now() - startTimeMs);
  const reason: string | undefined = typeof outcome === 'string' ? outcome : outcome.failure;
  const message: string =
    reason !== undefined
      ? `Request ${requestId} did not join the executing iteration after ${durationMs} ms: ${reason}`
      : `Request ${requestId} joined the executing iteration after ${durationMs} ms.`;
  process.stderr.write(`${new Date().toISOString()} ${message}\n`);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Restores the enabled states that `applySelections` changed. */
function restoreEnabledStates(
  graph: IOperationGraph,
  enabledStates: ReadonlyMap<Operation, Operation['enabled']>
): void {
  const operationsByState: Map<Operation['enabled'], Operation[]> = new Map();
  for (const [operation, enabled] of enabledStates) {
    if (operation.enabled !== enabled) {
      let operations: Operation[] | undefined = operationsByState.get(enabled);
      if (!operations) {
        operations = [];
        operationsByState.set(enabled, operations);
      }
      operations.push(operation);
    }
  }
  for (const [enabled, operations] of operationsByState) {
    graph.setEnabledStates(operations, enabled, 'unsafe');
  }
}
