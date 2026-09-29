// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IExecutionResult,
  IOperationExecutionResult,
  IOperationGraph,
  IOperationGraphIterationOptions,
  IPhasedCommandEngineRequestSettings,
  Operation,
  _IOperationGraphEventSink
} from '@microsoft/rush-lib';
import {
  getWorkspaceRequestOperationEnvironment,
  OperationStatus,
  PhasedCommandEngineBusyError
} from '@microsoft/rush-lib';
import { Sort } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { findNativeLockHolder } from '@rushstack/rush-client-core';
import type {
  IDaemonNativeLockHolder,
  IDaemonPhasedEngineShape,
  IDaemonPhasedOperationSelection,
  IDaemonPhasedRequest,
  IDaemonPhasedRequestResult,
  IDaemonTerminalPolicyResult
} from '@rushstack/rush-daemon-protocol';

import { PhasedRequestEventSink } from './PhasedRequestEventSink';
import { PhasedRequestEventMultiplexer } from './PhasedRequestEventMultiplexer';
import { PhasedIterationDemand } from './PhasedIterationDemand';
import { writePhasedRequestSummaryAsync } from './PhasedRequestSummary';
import type { IPhasedRequestClient } from './PhasedRequestClient';
import { DaemonRequiresInProcessError, evaluateDaemonTerminalPolicy } from './DaemonTerminalPolicy';
import { DaemonShutdownError, getDaemonShutdownReason } from './DaemonShutdownError';
import type { IInteractiveRequestSession } from './InteractiveRequestInputRouter';
import { classifyRushCommand } from './RushCommandRequestPolicy';
import {
  type IRequestLease,
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerError,
  RequestSchedulerErrorCode
} from './RequestScheduler';
import {
  getRequestAdmissionErrorCode,
  getWorkspaceRequestScheduler,
  type INativeLockWait,
  RequestAdmissionController
} from './WorkspaceRequestAdmission';
import { isNativeLockHeldByThisProcess } from './NativeRepositoryLock';
import type { IWorkspaceEngineShape } from './WorkspaceEngineComponentFactory';
import type { IWorkspaceSession } from './WorkspaceSession';
import {
  createPhasedCommandResult,
  type IPhasedOperationOutcome,
  parseWarningsAllowedByEnvironment
} from './CommandResultPolicy';
import {
  collectPhasedRequestTelemetryRecords,
  type IPhasedRequestTelemetryMeasure,
  type IPhasedRequestTelemetryObservations,
  type IPhasedRequestTelemetryRecords,
  type IPhasedRequestTelemetryReport,
  type IPhasedRequestTelemetrySink
} from './PhasedRequestTelemetry';

interface IDualEmitOperationGraph extends IOperationGraph {
  eventSink: _IOperationGraphEventSink | undefined;
}

interface IResolvedSelection {
  readonly activeOperations: ReadonlyArray<Operation>;
  readonly enabledOperations: ReadonlyArray<Operation>;
  readonly ignoreDependencyOperations: ReadonlyArray<Operation>;
  readonly exact: boolean;
}

interface IGraphRoutingState {
  readonly coordinator: PhasedRequestBatchCoordinator;
  readonly multiplexer: PhasedRequestEventMultiplexer;
}

interface IPreparedPhasedRequest {
  readonly onExecutionStarting: (() => void) | undefined;
  /** The `performance.now()` timestamp at which the request was admitted. */
  readonly admittedTimeMs: number;
  readonly client: IPhasedRequestClient;
  readonly exclusivityClass: RequestExclusivityClass;
  readonly interactiveSession: IInteractiveRequestSession | undefined;
  /** Lets requests that cannot run alongside this one preempt its workspace admission; see `#settleEntry`. */
  readonly markAdmissionPreemptible: (onPreempted: () => void) => void;
  readonly request: IDaemonPhasedRequest;
  /** The settings that the request's iteration applies to the graph. */
  readonly requestSettings: IPhasedCommandEngineRequestSettings | undefined;
  /**
   * Only requests with the same settings, and the same values for every variable that the graph's operations hash,
   * share one graph iteration.
   */
  readonly requestSettingsKey: string;
  readonly selection: IResolvedSelection;
  /** The `performance.now()` timestamp at which the daemon received the request; see `#canJoinCurrentBatch`. */
  readonly receivedTimeMs: number;
  /** The `performance.now()` timestamp at which the router received the request. */
  readonly startTimeMs: number;
  readonly telemetry: IPhasedRequestTelemetrySink | undefined;
  readonly warningsAllowedByEnvironment: boolean;
}

/** `performance.now()` timestamps of one batch's handling, shared by its participants' telemetry. */
interface IBatchTimings {
  readonly startTimeMs: number;
  batchSize: number;
  leasesAcquiredTimeMs: number | undefined;
  /** The end of the wait for connecting clients, where the input reconcile starts. */
  reconcileStartTimeMs: number | undefined;
  reconciledTimeMs: number | undefined;
  selectionsAppliedTimeMs: number | undefined;
  /** The start of `scheduleIterationAsync`, which is where a native iteration's duration starts. */
  scheduleStartTimeMs: number | undefined;
  scheduledTimeMs: number | undefined;
  executionStartTimeMs: number | undefined;
  iterationEndTimeMs: number | undefined;
}

interface IBatchEntry extends IPreparedPhasedRequest {
  abortListener: (() => void) | undefined;
  abortRequested: boolean;
  /** Waits for native Rush's repository lock for this request; see `#acquireExecutionLeaseAsync`. */
  readonly admissionController: RequestAdmissionController;
  batchTimings: IBatchTimings | undefined;
  completed: boolean;
  /**
   * Set when a failed result is published while operations of this request that the failure did not block are
   * still unfinished. They keep running, and the request stays active until the iteration ends; see
   * `#finishFailedEntry`.
   */
  continuesAfterResult: boolean;
  executionStarted: boolean;
  /**
   * Set when this entry's result starts being produced, so it is produced exactly once. An entry can finish while
   * its batch's iteration is still running for other participants; see `#finishSettledEntry`.
   */
  finishPromise: Promise<void> | undefined;
  /** The `performance.now()` timestamp at which the entry was taken into a batch. */
  joinedTimeMs: number | undefined;
  /** Logs the telemetry entry of an entry that continues after its result, once its iteration ended. */
  logTelemetryAfterIteration: (() => void) | undefined;
  outputError: unknown;
  participated: boolean;
  reject: (error: unknown) => void;
  requestSink: PhasedRequestEventSink | undefined;
  resolve: (result: IDaemonPhasedRequestResult) => void;
  /** Settles the request of an entry that continues after its result, once its iteration ended. */
  settleAfterIteration: (() => void) | undefined;
  unsubscribe: (() => void) | undefined;
}

/**
 * How a result reports the client's operations: after the iteration ended (`'final'`), or while it still runs,
 * with unfinished operations reported as aborted because the client stopped waiting for them (`'abandoned'`), or
 * with their current status because they run on after an early failure result (`'running'`).
 */
type OperationReport = 'final' | 'abandoned' | 'running';

const ROUTING_STATE_BY_GRAPH: WeakMap<IOperationGraph, IGraphRoutingState> = new WeakMap();
const OBSERVED_STATUS_OVERRIDES_RETAINED: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.Aborted,
  OperationStatus.Blocked,
  OperationStatus.Skipped
]);
const IN_PROGRESS_STATUSES: ReadonlySet<string> = new Set<string>([
  OperationStatus.Waiting,
  OperationStatus.Ready,
  OperationStatus.Queued,
  OperationStatus.Executing
]);

/**
 * Routes one caller-resolved phased request through a real warm workspace operation graph.
 *
 * @remarks
 * Command parsing, plugin loading, and graph construction remain integration-owned. Compatible shared-build requests
 * admitted before an iteration starts are merged into one graph execution. Cancellation never closes the daemon-owned
 * graph or its runners.
 *
 * @beta
 */
export class PhasedRequestRouter {
  readonly #workspaceSession: IWorkspaceSession;

  public constructor(workspaceSession: IWorkspaceSession) {
    this.#workspaceSession = workspaceSession;
  }

  /**
   * Validates and executes one resolved phased request against the warm graph.
   *
   * @remarks
   * If `telemetry` is provided, it receives this request's report once the request has taken part in a graph
   * iteration or a no-op check, after the result was written to the client or the write failed. A failed
   * result that is published while operations of the request still run is reported once the iteration ended.
   *
   * `receivedTimeMs` is the `performance.now()` timestamp at which the daemon received the request. The request can
   * join a batch whose input reconcile started after this time. It defaults to the time of this call.
   * `requestExclusivityClass` is the admission class chosen by the resolver; it defaults to `classifyRushCommand`.
   */
  public async executeAsync(
    request: IDaemonPhasedRequest,
    client: IPhasedRequestClient,
    exactSelection: boolean = false,
    onExecutionStarting?: () => void,
    requestSettings?: IPhasedCommandEngineRequestSettings,
    telemetry?: IPhasedRequestTelemetrySink,
    receivedTimeMs?: number,
    requestExclusivityClass?: RequestExclusivityClass
  ): Promise<IDaemonPhasedRequestResult> {
    const startTimeMs: number = performance.now();
    validateRequestIdentity(request);
    const interactiveSession: IInteractiveRequestSession | undefined = validateInteractiveSession(
      request,
      client
    );
    const policy: IDaemonTerminalPolicyResult = evaluateDaemonTerminalPolicy(
      request.requestId,
      request.terminalRequirement
    );
    if (policy.decision === 'requiresInProcess') {
      await interactiveSession?.finishAsync();
      await client.writeTerminalPolicyAsync(policy);
      throw new DaemonRequiresInProcessError(policy);
    }
    const graph: IDualEmitOperationGraph = getDualEmitGraph(this.#workspaceSession);
    const routingState: IGraphRoutingState = getGraphRoutingState(graph, this.#workspaceSession);
    const exclusivityClass: RequestExclusivityClass =
      requestExclusivityClass ??
      classifyRushCommand({
        commandName: request.commandName,
        commandOrigin: request.commandOrigin
      });
    const workspaceScheduler: RequestScheduler = getWorkspaceRequestScheduler(this.#workspaceSession);
    let admissionController: RequestAdmissionController | undefined;
    let admissionLease: IRequestLease;
    try {
      admissionController = new RequestAdmissionController({
        admission: request.admission,
        client,
        requestId: request.requestId
      });
      admissionLease = await admissionController.acquireAsync(workspaceScheduler, exclusivityClass);
    } catch (error) {
      admissionController?.dispose();
      return await finishAfterAdmissionErrorAsync(request, client, interactiveSession, error);
    }
    const admittedTimeMs: number = performance.now();

    try {
      let inputAttachment: Disposable | undefined;
      try {
        inputAttachment = attachInteractiveInput(request, client, interactiveSession);
        try {
          validateEngineShape(request.engineShape, this.#workspaceSession.engineShape);
          const operationById: ReadonlyMap<string, Operation> = indexOperations(graph.operations);
          const selection: IResolvedSelection = resolveSelection(
            request.operationSelection,
            operationById,
            exactSelection
          );
          let warningsAllowedByEnvironment: boolean;
          try {
            warningsAllowedByEnvironment = parseWarningsAllowedByEnvironment(request.environment);
          } catch (error) {
            const cleanupErrors: unknown[] = [];
            await collectInteractiveCleanupErrorAsync(interactiveSession, cleanupErrors);
            const result: IDaemonPhasedRequestResult = createPhasedCommandResult({
              aborted: client.abortSignal.aborted,
              error: combineErrors(error, cleanupErrors),
              graphStatus: graph.status,
              operationOutcomes: [],
              requestId: request.requestId,
              scheduled: false,
              warningsAllowedByEnvironment: false
            });
            await client.writeResultAsync(result);
            return result;
          }
          if (client.abortSignal.aborted) {
            return await writeAbortedResultAsync(request.requestId, client, interactiveSession);
          }
          const lease: IRequestLease = admissionLease;
          return await routingState.coordinator.enqueueAsync(
            {
              admittedTimeMs,
              client,
              exclusivityClass,
              interactiveSession,
              markAdmissionPreemptible: (onPreempted: () => void) =>
                workspaceScheduler.markLeasePreemptible(lease, onPreempted),
              receivedTimeMs: receivedTimeMs ?? startTimeMs,
              request,
              requestSettings,
              requestSettingsKey: getRequestSettingsKey(graph, request, requestSettings),
              selection,
              startTimeMs,
              telemetry,
              warningsAllowedByEnvironment,
              onExecutionStarting
            },
            admissionController
          );
        } catch (error) {
          if (error instanceof RequestSchedulerError) {
            return await finishAfterAdmissionErrorAsync(request, client, interactiveSession, error);
          }
          return await finishAfterRoutingErrorAsync(interactiveSession, error);
        }
      } finally {
        inputAttachment?.[Symbol.dispose]();
      }
    } finally {
      admissionLease.release();
      admissionController.dispose();
    }
  }
}

class PhasedRequestBatchCoordinator {
  readonly #graph: IDualEmitOperationGraph;
  readonly #graphExecutionScheduler: RequestScheduler;
  readonly #multiplexer: PhasedRequestEventMultiplexer;
  readonly #pending: IBatchEntry[] = [];
  readonly #workspaceSession: IWorkspaceSession;
  readonly #abortErrors: unknown[] = [];
  #abortTail: Promise<void> = Promise.resolve();
  #acceptingCurrentBatch: boolean = false;
  /** Set while the current batch's iteration may execute; see `#restrictBatchDemand`. */
  #batchDemand: PhasedIterationDemand | undefined;
  #currentBatch: ReadonlyArray<IBatchEntry> | undefined;
  #drainScheduled: boolean = false;
  #nextGraphLeasePromise: Promise<IRequestLease> | undefined;
  /** When the current batch's input reconcile started, or undefined before it starts. */
  #reconcileStartTimeMs: number | undefined;
  #running: boolean = false;

  public constructor(
    graph: IDualEmitOperationGraph,
    graphExecutionScheduler: RequestScheduler,
    multiplexer: PhasedRequestEventMultiplexer,
    workspaceSession: IWorkspaceSession
  ) {
    this.#graph = graph;
    this.#graphExecutionScheduler = graphExecutionScheduler;
    this.#multiplexer = multiplexer;
    this.#workspaceSession = workspaceSession;
  }

  public async enqueueAsync(
    request: IPreparedPhasedRequest,
    admissionController: RequestAdmissionController
  ): Promise<IDaemonPhasedRequestResult> {
    if (!this.#canJoinCurrentBatch(request)) {
      const graphExclusivityClass: RequestExclusivityClass =
        request.exclusivityClass === RequestExclusivityClass.SharedBuild
          ? RequestExclusivityClass.SharedBuild
          : RequestExclusivityClass.Exclusive;
      const graphWaitLease: IRequestLease = await admissionController.acquireGraphExecutionAsync(
        this.#graphExecutionScheduler,
        graphExclusivityClass
      );
      graphWaitLease.release();
    }
    return new Promise<IDaemonPhasedRequestResult>((resolve, reject) => {
      const entry: IBatchEntry = {
        ...request,
        abortListener: undefined,
        abortRequested: false,
        admissionController,
        batchTimings: undefined,
        completed: false,
        continuesAfterResult: false,
        executionStarted: false,
        finishPromise: undefined,
        joinedTimeMs: undefined,
        logTelemetryAfterIteration: undefined,
        outputError: undefined,
        participated: false,
        reject,
        requestSink: undefined,
        resolve,
        settleAfterIteration: undefined,
        unsubscribe: undefined
      };
      entry.abortListener = () => this.#deactivateEntry(entry, true);
      request.client.abortSignal.addEventListener('abort', entry.abortListener, { once: true });
      this.#pending.push(entry);
      this.#scheduleDrain();
    });
  }

  #scheduleDrain(): void {
    if (this.#running || this.#drainScheduled) {
      return;
    }
    this.#drainScheduled = true;
    this.#nextGraphLeasePromise = this.#graphExecutionScheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    setImmediate(() => {
      this.#drainScheduled = false;
      void this.#drainAsync();
    });
  }

  async #drainAsync(): Promise<void> {
    if (this.#running) {
      return;
    }
    this.#running = true;
    try {
      if (this.#pending.length === 0) {
        const unusedGraphLeasePromise: Promise<IRequestLease> | undefined = this.#nextGraphLeasePromise;
        this.#nextGraphLeasePromise = undefined;
        (await unusedGraphLeasePromise)?.release();
        return;
      }
      while (this.#pending.length > 0) {
        const first: IBatchEntry = this.#pending.shift()!;
        const batch: IBatchEntry[] = [first];
        if (first.exclusivityClass === RequestExclusivityClass.SharedBuild) {
          this.#takeCompatiblePending(batch);
        }
        this.#currentBatch = batch;
        this.#acceptingCurrentBatch = first.exclusivityClass === RequestExclusivityClass.SharedBuild;
        this.#reconcileStartTimeMs = undefined;
        const joinedTimeMs: number = performance.now();
        for (const entry of batch) {
          entry.executionStarted = true;
          entry.joinedTimeMs ??= joinedTimeMs;
        }
        try {
          await this.#executeBatchAsync(batch);
        } catch (error) {
          await Promise.all(batch.map((entry: IBatchEntry) => this.#rejectEntryAsync(entry, error)));
        } finally {
          this.#acceptingCurrentBatch = false;
          this.#reconcileStartTimeMs = undefined;
          this.#currentBatch = undefined;
        }
      }
    } finally {
      this.#running = false;
      if (this.#pending.length > 0) {
        this.#scheduleDrain();
      }
    }
  }

  #canJoinCurrentBatch(request: IPreparedPhasedRequest): boolean {
    if (request.exclusivityClass !== RequestExclusivityClass.SharedBuild) {
      return false;
    }
    if (!this.#running) {
      return true;
    }
    return (
      this.#acceptingCurrentBatch &&
      // A request received after the reconcile started may have changed an input that the reconcile already read.
      (this.#reconcileStartTimeMs === undefined || request.receivedTimeMs < this.#reconcileStartTimeMs) &&
      this.#currentBatch?.[0]?.exclusivityClass === RequestExclusivityClass.SharedBuild &&
      this.#currentBatch[0].requestSettingsKey === request.requestSettingsKey
    );
  }

  #takeCompatiblePending(batch: IBatchEntry[]): void {
    const { requestSettingsKey } = batch[0];
    for (let index: number = 0; index < this.#pending.length; ) {
      const entry: IBatchEntry = this.#pending[index];
      if (
        entry.exclusivityClass === RequestExclusivityClass.SharedBuild &&
        entry.requestSettingsKey === requestSettingsKey
      ) {
        this.#pending.splice(index, 1);
        entry.executionStarted = true;
        entry.joinedTimeMs = performance.now();
        batch.push(entry);
      } else {
        index++;
      }
    }
  }

  async #executeBatchAsync(batch: IBatchEntry[]): Promise<void> {
    const timings: IBatchTimings = {
      startTimeMs: performance.now(),
      batchSize: 0,
      leasesAcquiredTimeMs: undefined,
      reconcileStartTimeMs: undefined,
      reconciledTimeMs: undefined,
      selectionsAppliedTimeMs: undefined,
      scheduleStartTimeMs: undefined,
      scheduledTimeMs: undefined,
      executionStartTimeMs: undefined,
      iterationEndTimeMs: undefined
    };
    const graphLeasePromise: Promise<IRequestLease> =
      this.#nextGraphLeasePromise ??
      this.#graphExecutionScheduler.acquireAsync({
        exclusivityClass: RequestExclusivityClass.Exclusive
      });
    this.#nextGraphLeasePromise = undefined;
    const graphLease: IRequestLease = await graphLeasePromise;
    let executionLease: AsyncDisposable | undefined;
    let releasePromise: Promise<void> | undefined;
    const releaseExecutionLeaseAsync: () => Promise<void> = () => {
      releasePromise ??= (async () => {
        await executionLease?.[Symbol.asyncDispose]();
      })();
      return releasePromise;
    };
    try {
      if (this.#graph.hasScheduledIteration || this.#graph.status === OperationStatus.Executing) {
        throw new Error('The warm workspace operation graph is not idle.');
      }
      executionLease = await this.#acquireExecutionLeaseAsync(batch);
      timings.leasesAcquiredTimeMs = performance.now();
      if (this.#acceptingCurrentBatch) {
        // A client that connected while the daemon was busy may not have sent its request yet. Let it, so that
        // the request is received before the reconcile starts and can join this batch.
        await batch[0].client.waitForConnectingClientsAsync?.();
      }
      // Requests received before this point made their changes before the reconcile reads the inputs, so they can
      // still join while it runs. Requests received later wait for the next batch, which reconciles again.
      this.#reconcileStartTimeMs = timings.reconcileStartTimeMs = performance.now();
      await this.#workspaceSession.reconcileInvalidationsAsync();
      timings.reconciledTimeMs = performance.now();

      if (batch[0].exclusivityClass === RequestExclusivityClass.SharedBuild) {
        this.#takeCompatiblePending(batch);
      }
      this.#acceptingCurrentBatch = false;

      const participants: IBatchEntry[] = batch.filter((entry: IBatchEntry) => this.#isEntryLive(entry));
      if (participants.length === 0) {
        const beforeResultAsync: (() => Promise<void>) | undefined = executionLease
          ? createBatchReleaseBarrier(batch, releaseExecutionLeaseAsync)
          : undefined;
        await Promise.all(
          batch.map((entry: IBatchEntry) =>
            this.#finishEntryAsync(entry, false, undefined, [], beforeResultAsync)
          )
        );
        return;
      }

      applyRequestSettings(this.#graph, participants[0].requestSettings);
      applySelections(
        this.#graph,
        participants.map((entry: IBatchEntry) => entry.selection)
      );
      timings.selectionsAppliedTimeMs = performance.now();
      timings.batchSize = participants.length;
      for (const entry of batch) {
        if (!participants.includes(entry)) {
          // Clients that cancelled before execution must not wait for the participants' work.
          this.#finishDetachedEntry(entry);
        }
      }
      // Batches never mix request settings (`requestSettingsKey`).
      const isIncrementalBuildAllowed: boolean | undefined =
        participants[0].requestSettings?.isIncrementalBuildAllowed;
      if (isIncrementalBuildAllowed === false) {
        // Like a native `rush rebuild` process, a non-incremental request starts every operation it runs cold.
        await this.#graph.closeRunnersAsync(
          Array.from(this.#graph.operations).filter((operation: Operation) => operation.enabled !== false)
        );
      }
      const demand: PhasedIterationDemand = new PhasedIterationDemand(() => this.#onBatchAbandoned(demand));
      this.#batchDemand = demand;
      const unsubscribeDemand: () => void = this.#multiplexer.subscribe(demand);
      for (const entry of participants) {
        entry.participated = true;
        entry.batchTimings = timings;
        const activeOperationIds: ReadonlySet<string> = new Set(
          entry.selection.activeOperations.map((operation: Operation) => operation.name)
        );
        entry.requestSink = new PhasedRequestEventSink({
          activeOperationIds,
          client: entry.client,
          getNextSequence: () => entry.client.getNextEventSequence(),
          onWriteFailure: (error: Error) => this.#deactivateEntry(entry, false, error),
          onActiveOperationsSettled: () => this.#finishSettledEntry(entry),
          earlyFailure:
            entry.request.returnEarlyOnFailure === true &&
            entry.exclusivityClass === RequestExclusivityClass.SharedBuild
              ? {
                  targetOperationIds: getTargetOperationIds(entry.selection.activeOperations),
                  onSettled: (unfinishedOperations: number) =>
                    this.#finishFailedEntry(entry, unfinishedOperations)
                }
              : undefined,
          rushVersion: this.#workspaceSession.metadata.rushVersion
        });
        entry.unsubscribe = this.#multiplexer.subscribe(entry.requestSink);
      }

      const previousPauseNextIteration: boolean = this.#graph.pauseNextIteration;
      setPauseNextIteration(this.#graph, true);
      let scheduled: boolean = false;
      let executionError: unknown;
      const iterationCleanupErrors: unknown[] = [];
      try {
        for (const entry of participants) entry.onExecutionStarting?.();
        timings.scheduleStartTimeMs = performance.now();
        scheduled = await this.#graph.scheduleIterationAsync({
          inputsSnapshot: this.#workspaceSession.inputsSnapshot,
          ...createOperationParticipantLookups(participants),
          isIncrementalBuildAllowed
        });
        timings.scheduledTimeMs = performance.now();
        if (scheduled) {
          await Promise.all(
            participants.map(async (entry: IBatchEntry) => {
              try {
                await entry.requestSink?.flushAsync();
              } catch {
                // The sink already recorded the write error and deactivated this client.
              }
            })
          );
          timings.executionStartTimeMs = performance.now();
          const executionPromise: Promise<boolean> = this.#graph.executeScheduledIterationAsync();
          if (!participants.some((entry: IBatchEntry) => this.#needsIteration(entry)) || demand.abandoned) {
            // Let executeScheduledIterationAsync promote the scheduled iteration before aborting it.
            await Promise.resolve();
            this.#requestIterationAbort();
            await this.#abortTail;
          }
          await executionPromise;
          timings.iterationEndTimeMs = performance.now();
        }
      } catch (error) {
        executionError = error;
        if (this.#graph.hasScheduledIteration) {
          try {
            const failedExecutionPromise: Promise<boolean> = this.#graph.executeScheduledIterationAsync();
            await Promise.resolve();
            this.#requestIterationAbort();
            await this.#abortTail;
            await failedExecutionPromise;
          } catch (cleanupError) {
            iterationCleanupErrors.push(cleanupError);
          }
        }
      } finally {
        this.#batchDemand = undefined;
        unsubscribeDemand();
        for (const entry of participants) {
          entry.unsubscribe?.();
          entry.unsubscribe = undefined;
        }
        setPauseNextIteration(this.#graph, previousPauseNextIteration);
      }

      await this.#abortTail;
      iterationCleanupErrors.push(...this.#abortErrors.splice(0));
      const beforeResultAsync: (() => Promise<void>) | undefined = executionLease
        ? createBatchReleaseBarrier(batch, releaseExecutionLeaseAsync)
        : undefined;
      await Promise.all(
        batch.map((entry: IBatchEntry) =>
          this.#finishEntryAsync(entry, scheduled, executionError, iterationCleanupErrors, beforeResultAsync)
        )
      );
    } finally {
      try {
        await releaseExecutionLeaseAsync();
      } finally {
        graphLease.release();
        for (const entry of batch) {
          this.#settleContinuingEntry(entry);
        }
      }
    }
  }

  #deactivateEntry(entry: IBatchEntry, aborted: boolean, outputError?: Error): void {
    if (entry.completed) {
      return;
    }
    if (aborted) {
      entry.abortRequested = true;
    } else {
      entry.outputError ??= outputError ?? new Error('The phased request client output failed.');
    }
    entry.unsubscribe?.();
    entry.unsubscribe = undefined;

    if (!entry.executionStarted) {
      const pendingIndex: number = this.#pending.indexOf(entry);
      if (pendingIndex >= 0) {
        this.#pending.splice(pendingIndex, 1);
        void this.#finishEntryAsync(entry, false, undefined).catch((error: unknown) => {
          this.#completeEntry(entry);
          entry.reject(error);
        });
        return;
      }
    }

    if (
      entry.executionStarted &&
      this.#currentBatch?.includes(entry) &&
      this.#hasLiveBatchParticipant()
    ) {
      // Other live participants still need the shared work: detach this client and answer it now.
      this.#finishDetachedEntry(entry);
      if (entry.participated) {
        this.#restrictBatchDemand();
      }
      return;
    }

    if (
      entry.executionStarted &&
      this.#currentBatch &&
      (this.#graph.hasScheduledIteration || this.#graph.status === OperationStatus.Executing) &&
      !this.#currentBatch.some((candidate: IBatchEntry) => this.#needsIteration(candidate))
    ) {
      this.#requestIterationAbort();
    }
  }

  #finishDetachedEntry(entry: IBatchEntry): void {
    entry.finishPromise ??= this.#produceResultAsync(
      entry,
      entry.participated,
      undefined,
      [],
      undefined,
      'abandoned'
    ).catch((error: unknown) => {
      if (!entry.completed) {
        this.#completeEntry(entry);
        entry.reject(error);
      }
    });
  }

  /**
   * Narrows the running iteration to the remaining participants' selections after a participant left it.
   *
   * @remarks
   * The departed client's selection stays merged into the iteration, so without this the remaining participants
   * would wait for, and queued requests would queue behind, work that only the departed client needed. Operations
   * that no remaining participant needs and that have not been handed to an execution slot finish as skipped
   * instead of starting. Once every operation a remaining participant needs has finished, the iteration is aborted
   * if unneeded work is still running, which terminates that work, as when every client cancels.
   */
  #restrictBatchDemand(): void {
    this.#batchDemand?.restrictTo(
      (this.#currentBatch ?? []).flatMap((candidate: IBatchEntry) =>
        this.#needsIteration(candidate) ? candidate.selection.activeOperations : []
      )
    );
  }

  #onBatchAbandoned(demand: PhasedIterationDemand): void {
    // Before the iteration starts executing, `#executeBatchAsync` aborts it once it has been promoted.
    if (this.#batchDemand === demand && this.#graph.status === OperationStatus.Executing) {
      this.#requestIterationAbort();
    }
  }

  #isEntryLive(entry: IBatchEntry): boolean {
    return !entry.abortRequested && !entry.client.abortSignal.aborted && entry.outputError === undefined;
  }

  /**
   * Whether a live client still needs the current batch's iteration, including compatible requests that were
   * accepted into the pending queue and will join the batch once the execution lease is acquired.
   */
  #hasLiveBatchParticipant(): boolean {
    if (this.#currentBatch?.some((candidate: IBatchEntry) => this.#needsIteration(candidate))) {
      return true;
    }
    return (
      this.#acceptingCurrentBatch &&
      this.#pending.some(
        (candidate: IBatchEntry) =>
          candidate.exclusivityClass === RequestExclusivityClass.SharedBuild && this.#isEntryLive(candidate)
      )
    );
  }

  /**
   * Whether a live participant still waits for the running iteration to produce its result, or has its result but
   * continues until the iteration ends.
   */
  #needsIteration(entry: IBatchEntry): boolean {
    return (entry.finishPromise === undefined || entry.continuesAfterResult) && this.#isEntryLive(entry);
  }

  /**
   * Publishes a coalesced participant's result as soon as every operation in its own selection has completed,
   * instead of holding it until the shared iteration finishes the other participants' larger selections.
   *
   * @remarks
   * The sink invokes this after the operations' final events and log chunks were enqueued, and `#finishEntryAsync`
   * drains them before writing the result. The iteration, graph lease and execution lease stay owned by the batch.
   * The last participant that needs the iteration keeps the ordinary contract: its result follows iteration end
   * and execution lease release, so single-client requests and warm-state retention are unchanged. When other
   * participants left the batch, `#restrictBatchDemand` makes that end prompt by skipping or aborting work only they
   * needed.
   */
  #finishSettledEntry(entry: IBatchEntry): void {
    if (
      entry.finishPromise !== undefined ||
      !this.#isEntryLive(entry) ||
      !entry.participated ||
      !this.#hasOtherBatchParticipant(entry)
    ) {
      return;
    }
    this.#startEarlyResult(entry, 'abandoned');
  }

  /**
   * Publishes a failed result as soon as nothing that is unfinished can change it, for a request that asked for
   * this (agent output): one of its operations failed or was blocked, and none of its targets is unfinished.
   *
   * @remarks
   * Its operations that the failure did not block keep running, so that later requests find them done. The
   * request stays active until the iteration ends, and `#settleContinuingEntry` then settles it. Meanwhile it keeps
   * its admission, so exclusive requests still wait for that work, and it holds the iteration like any live
   * participant, so another participant's departure does not abort that work. When none of its operations is
   * unfinished and no other participant needs the iteration, the iteration is ending anyway, and the ordinary
   * contract applies.
   */
  #finishFailedEntry(entry: IBatchEntry, unfinishedOperations: number): void {
    if (
      entry.finishPromise !== undefined ||
      !this.#isEntryLive(entry) ||
      !entry.participated ||
      (unfinishedOperations === 0 && !this.#hasOtherBatchParticipant(entry))
    ) {
      return;
    }
    entry.continuesAfterResult = unfinishedOperations > 0;
    this.#startEarlyResult(entry, 'running');
  }

  #hasOtherBatchParticipant(entry: IBatchEntry): boolean {
    return !!this.#currentBatch?.some(
      (candidate: IBatchEntry) => candidate !== entry && this.#needsIteration(candidate)
    );
  }

  #startEarlyResult(entry: IBatchEntry, report: OperationReport): void {
    entry.unsubscribe?.();
    entry.unsubscribe = undefined;
    entry.finishPromise = this.#produceEarlyResultAsync(entry, report).catch((error: unknown) => {
      // Unlike a batch-wide failure, an early result's failure concerns only this client.
      if (!entry.completed) {
        this.#abandonContinuingEntry(entry);
        this.#completeEntry(entry);
        // The abandoned operations may still be stopping, so the request keeps its admission until they are.
        this.#settleEntry(entry, () => entry.reject(error));
      }
    });
  }

  async #produceEarlyResultAsync(entry: IBatchEntry, report: OperationReport): Promise<void> {
    // The sink is notified from the record's `finalizeOperation()`, which synchronously precedes the close of
    // the record's StdioSummarizer and ProblemCollector. The summary reads the failure tail from the closed
    // summarizer, so yield once to let the notifying record finish closing before the summary is written.
    await Promise.resolve();
    await this.#produceResultAsync(entry, true, undefined, [], undefined, report);
  }

  /**
   * Stops the work that only an entry which continues after its result still holds, for example when the daemon
   * shuts down or when that result could not be produced.
   */
  #abandonContinuingEntry(entry: IBatchEntry): void {
    if (!entry.continuesAfterResult || entry.abortRequested) {
      return;
    }
    entry.abortRequested = true;
    if (!this.#currentBatch?.includes(entry)) {
      return;
    }
    if (this.#hasLiveBatchParticipant()) {
      this.#restrictBatchDemand();
    } else if (this.#graph.hasScheduledIteration || this.#graph.status === OperationStatus.Executing) {
      this.#requestIterationAbort();
    }
  }

  #settleContinuingEntry(entry: IBatchEntry): void {
    const logTelemetry: (() => void) | undefined = entry.logTelemetryAfterIteration;
    entry.logTelemetryAfterIteration = undefined;
    logTelemetry?.();
    const settle: (() => void) | undefined = entry.settleAfterIteration;
    if (!settle) {
      return;
    }
    entry.settleAfterIteration = undefined;
    if (entry.abortListener) {
      entry.client.abortSignal.removeEventListener('abort', entry.abortListener);
      entry.abortListener = undefined;
    }
    settle();
  }

  #requestIterationAbort(): void {
    // Nobody needs the running work any more, so terminate in-flight operations instead of awaiting them.
    const abortPromise: Promise<void> = this.#graph.abortCurrentIterationAsync({ terminateRunning: true });
    this.#abortTail = Promise.all([this.#abortTail, abortPromise])
      .then(() => undefined)
      .catch((error: unknown) => {
        this.#abortErrors.push(error);
      });
  }

  #finishEntryAsync(
    entry: IBatchEntry,
    batchScheduled: boolean,
    executionError: unknown,
    batchCleanupErrors: ReadonlyArray<unknown> = [],
    beforeResultAsync?: () => Promise<void>
  ): Promise<void> {
    entry.finishPromise ??= this.#produceResultAsync(
      entry,
      batchScheduled,
      executionError,
      batchCleanupErrors,
      beforeResultAsync,
      'final'
    );
    return entry.finishPromise;
  }

  async #produceResultAsync(
    entry: IBatchEntry,
    batchScheduled: boolean,
    executionError: unknown,
    batchCleanupErrors: ReadonlyArray<unknown>,
    beforeResultAsync: (() => Promise<void>) | undefined,
    report: OperationReport
  ): Promise<void> {
    if (entry.completed) {
      return;
    }
    const cleanupErrors: unknown[] = [...batchCleanupErrors];
    if (entry.requestSink) {
      if (entry.participated && this.#isEntryLive(entry)) {
        try {
          await writePhasedRequestSummaryAsync({
            activeOperations: entry.selection.activeOperations,
            commandName: entry.request.commandName,
            executionError,
            graph: this.#graph,
            onResultsAsync: this.#getRequestHookInvoker(entry),
            sink: entry.requestSink,
            startTimeMs: entry.startTimeMs,
            warningsAllowedByEnvironment: entry.warningsAllowedByEnvironment
          });
        } catch (error) {
          // A plugin's afterExecuteRequestAsync tap failed, which fails this request as it fails a native command.
          cleanupErrors.push(error);
        }
      }
      try {
        await entry.requestSink.flushAsync();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    await collectInteractiveCleanupErrorAsync(entry.interactiveSession, cleanupErrors);
    try {
      await beforeResultAsync?.();
    } catch (error) {
      cleanupErrors.push(error);
    }
    const aborted: boolean = entry.abortRequested || entry.client.abortSignal.aborted;
    const operationOutcomes: ReadonlyArray<IPhasedOperationOutcome> = entry.requestSink
      ? collectOperationOutcomes(
          entry.selection.activeOperations,
          this.#graph,
          entry.requestSink,
          aborted && entry.participated,
          report
        )
      : [];
    const result: IDaemonPhasedRequestResult = createPhasedCommandResult({
      aborted,
      error: combineErrors(
        executionError ?? getDaemonShutdownReason(entry.client.abortSignal),
        cleanupErrors
      ),
      graphStatus: getClientGraphStatus(aborted, operationOutcomes),
      operationOutcomes,
      requestId: entry.request.requestId,
      scheduled: entry.participated && batchScheduled,
      warningsAllowedByEnvironment: entry.warningsAllowedByEnvironment
    });
    const logTelemetry: (() => void) | undefined = entry.participated
      ? this.#prepareTelemetry(entry, result, batchScheduled, report !== 'final')
      : undefined;
    try {
      try {
        await entry.client.writeResultAsync(result);
      } finally {
        logTelemetry?.();
      }
      this.#completeEntry(entry);
      this.#settleEntry(entry, () => entry.resolve(result));
    } catch (error) {
      this.#completeEntry(entry);
      this.#settleEntry(entry, () => entry.reject(error));
    }
  }

  /**
   * Takes the request's telemetry report as of the result that is about to be written, and returns the function
   * that logs it.
   *
   * @remarks
   * The router logs the report once it wrote the result, or failed to. Logging an entry takes milliseconds. In a
   * batch whose results are produced together, logging first would make every client of the batch wait for all of
   * the batch's entries, and would add the earlier entries' logging to each entry's timing; now every result is
   * written before any entry is logged. In a scheduled batch, results come in groups as operations finish, so each
   * result is written before its own entry is logged, and an earlier group's entries may be logged before a later
   * group's results are written.
   *
   * An entry that continues after its result gets no function: the operations that its failure did not block
   * still run, so its report waits until the iteration ended, and `#settleContinuingEntry` sends it with their
   * final statuses. Either way, the report has the timing of the result that the client receives.
   */
  #prepareTelemetry(
    entry: IBatchEntry,
    result: IDaemonPhasedRequestResult,
    batchScheduled: boolean,
    earlyResult: boolean
  ): (() => void) | undefined {
    const { batchTimings: timings, requestSink, telemetry } = entry;
    if (!telemetry || !requestSink || !timings) {
      return undefined;
    }
    let report: IPhasedRequestTelemetryReport;
    try {
      const resultTimeMs: number = performance.now();
      const executionStartTimeMs: number = Math.max(timings.startTimeMs, entry.joinedTimeMs ?? 0);
      // Measured now, because the batch timings go on changing until the iteration ends.
      const measures: IPhasedRequestTelemetryMeasure[] = createTelemetryMeasures(
        entry,
        timings,
        executionStartTimeMs,
        resultTimeMs
      );
      const createReport = (
        observations: IPhasedRequestTelemetryObservations
      ): IPhasedRequestTelemetryReport => {
        const { records, countRetained }: IPhasedRequestTelemetryRecords =
          collectPhasedRequestTelemetryRecords({
            activeOperations: entry.selection.activeOperations,
            graph: this.#graph,
            observations,
            upToDateTimeMs: executionStartTimeMs
          });
        return {
          request: entry.request,
          result,
          records,
          countRetained,
          batchSize: timings.batchSize,
          scheduled: batchScheduled,
          earlyResult,
          receivedTimeMs: entry.startTimeMs,
          executionStartTimeMs,
          iterationStartTimeMs: batchScheduled ? timings.scheduleStartTimeMs : undefined,
          resultTimeMs,
          measures
        };
      };
      if (entry.continuesAfterResult) {
        entry.logTelemetryAfterIteration = () => {
          try {
            telemetry.logRequest(createReport(getIterationObservations(requestSink)));
          } catch {
            // Telemetry never changes a request's result.
          }
        };
        return undefined;
      }
      report = createReport(requestSink);
    } catch {
      // Telemetry never changes a request's result.
      return undefined;
    }
    return () => {
      try {
        telemetry.logRequest(report);
      } catch {
        // Telemetry never changes a request's result.
      }
    };
  }

  #settleEntry(entry: IBatchEntry, settle: () => void): void {
    if (!entry.continuesAfterResult) {
      settle();
      return;
    }
    entry.settleAfterIteration = settle;
    // The client has its result, so from now on its departure no longer matters, but the request's own abort
    // (the daemon shutting down) still stops the work it holds.
    entry.abortListener = () => this.#abandonContinuingEntry(entry);
    entry.client.abortSignal.addEventListener('abort', entry.abortListener, { once: true });
    // Nobody waits for that work, so it must not delay requests that cannot run alongside it, such as a rebuild.
    entry.markAdmissionPreemptible(() => this.#abandonContinuingEntry(entry));
  }

  /**
   * Returns the callback that invokes the graph's `afterExecuteRequestAsync` hook with one request's own results,
   * or `undefined` when no plugin tapped it.
   *
   * @remarks
   * A native command invokes the hook after each iteration. The daemon invokes it once for each request it serves
   * instead, including a warm no-op request that needs no iteration, and in the request's own output.
   */
  #getRequestHookInvoker(
    entry: IBatchEntry
  ): ((results: IExecutionResult, terminal: ITerminal) => Promise<void>) | undefined {
    const { afterExecuteRequestAsync } = this.#graph.hooks;
    if (!afterExecuteRequestAsync.isUsed()) {
      return undefined;
    }
    const { commandName, environment, requestId } = entry.request;
    return async (results: IExecutionResult, terminal: ITerminal): Promise<void> => {
      await afterExecuteRequestAsync.promise({ ...results, commandName, environment, requestId, terminal });
    };
  }

  async #rejectEntryAsync(entry: IBatchEntry, error: unknown): Promise<void> {
    if (entry.finishPromise) {
      try {
        await entry.finishPromise;
      } catch {
        // An interrupted result is replaced by the batch failure below.
      }
    }
    if (entry.completed) {
      // The batch failed after this entry's early result: its iteration has ended.
      this.#settleContinuingEntry(entry);
      return;
    }
    entry.unsubscribe?.();
    entry.unsubscribe = undefined;
    const cleanupErrors: unknown[] = [];
    if (entry.requestSink) {
      try {
        await entry.requestSink.flushAsync();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    this.#completeEntry(entry);
    entry.reject(combineErrors(error, cleanupErrors));
  }

  /**
   * Acquires the workspace session's execution lease, which holds native Rush's repository lock. While another Rush
   * process holds that lock, each request of the batch waits for it as it would for another request, within its own
   * remaining admission budget, and its client is told which process it waits for; see
   * `RequestAdmissionController.beginNativeLockWait`. A request that may not wait any longer leaves the batch with
   * an admission error while the others wait on, and compatible requests that arrive meanwhile join the batch.
   *
   * @remarks
   * The lease is acquired again rather than probed, since acquiring it invalidates what native Rush may have
   * changed. If this process holds the lock itself, the batch fails at once, since waiting would not end.
   */
  async #acquireExecutionLeaseAsync(batch: IBatchEntry[]): Promise<AsyncDisposable | undefined> {
    const session: IWorkspaceSession = this.#workspaceSession;
    const lockFolder: string = session.rushConfiguration.commonTempFolder;
    const waits: Map<IBatchEntry, INativeLockWait> = new Map();
    try {
      for (;;) {
        try {
          return await session.acquireExecutionLeaseAsync?.();
        } catch (error) {
          if (!(error instanceof PhasedCommandEngineBusyError) || isNativeLockHeldByThisProcess(lockFolder)) {
            throw error;
          }
        }
        if (batch[0].exclusivityClass === RequestExclusivityClass.SharedBuild) {
          this.#takeCompatiblePending(batch);
        }
        const holder: IDaemonNativeLockHolder = findNativeLockHolder(lockFolder);
        let retryDelayMs: number | undefined;
        let lastError: unknown;
        for (const entry of [...batch]) {
          // A client that left the batch while others wait on has its answer already.
          if (entry.finishPromise || entry.completed) continue;
          let wait: INativeLockWait | undefined = waits.get(entry);
          if (!wait) {
            wait = entry.admissionController.beginNativeLockWait();
            waits.set(entry, wait);
          }
          const error: RequestSchedulerError | undefined = wait.update(holder);
          if (!error) {
            retryDelayMs = Math.min(retryDelayMs ?? wait.retryDelayMs, wait.retryDelayMs);
            continue;
          }
          batch.splice(batch.indexOf(entry), 1);
          waits.delete(entry);
          lastError = await wait.endAsync().then(
            () => error,
            (writeError: unknown) => writeError
          );
          await this.#rejectEntryAsync(entry, lastError);
        }
        if (retryDelayMs === undefined) {
          throw lastError ?? new Error('No request of the batch waits for the repository lock any longer.');
        }
        await new Promise<void>((resolve: () => void) => setTimeout(resolve, retryDelayMs));
      }
    } finally {
      await Promise.all(
        Array.from(waits, async ([entry, wait]: [IBatchEntry, INativeLockWait]) => {
          try {
            await wait.endAsync();
          } catch (error) {
            this.#deactivateEntry(entry, false, error instanceof Error ? error : undefined);
          }
        })
      );
    }
  }

  #completeEntry(entry: IBatchEntry): void {
    entry.completed = true;
    if (entry.abortListener) {
      entry.client.abortSignal.removeEventListener('abort', entry.abortListener);
      entry.abortListener = undefined;
    }
  }
}

function createTelemetryMeasures(
  entry: IBatchEntry,
  timings: IBatchTimings,
  executionStartTimeMs: number,
  resultTimeMs: number
): IPhasedRequestTelemetryMeasure[] {
  const measures: IPhasedRequestTelemetryMeasure[] = [];
  function addMeasure(name: string, startTimeMs: number | undefined, endTimeMs: number | undefined): void {
    if (startTimeMs !== undefined && endTimeMs !== undefined) {
      measures.push({ name: `rush:daemon:${name}`, startTimeMs, endTimeMs });
    }
  }
  addMeasure('admission', entry.startTimeMs, entry.admittedTimeMs);
  addMeasure('queueWait', entry.admittedTimeMs, executionStartTimeMs);
  addMeasure('acquireExecutionLease', timings.startTimeMs, timings.leasesAcquiredTimeMs);
  addMeasure('awaitConnectingClients', timings.leasesAcquiredTimeMs, timings.reconcileStartTimeMs);
  addMeasure('reconcileInvalidations', timings.reconcileStartTimeMs, timings.reconciledTimeMs);
  addMeasure('applySelections', timings.reconciledTimeMs, timings.selectionsAppliedTimeMs);
  addMeasure('scheduleIteration', timings.scheduleStartTimeMs, timings.scheduledTimeMs);
  addMeasure('executeIteration', timings.executionStartTimeMs, timings.iterationEndTimeMs ?? resultTimeMs);
  return measures;
}

/**
 * The request's operations as the iteration's own records have them. The request's sink stops observing the
 * iteration when it publishes an early result, so it has not seen what happened to them since. Once the
 * iteration ended, these records have their final statuses.
 */
function getIterationObservations(requestSink: PhasedRequestEventSink): IPhasedRequestTelemetryObservations {
  return {
    getObservedResult: (operation: Operation) => {
      const executionResult: IOperationExecutionResult | undefined =
        requestSink.getScheduledResult(operation);
      return executionResult ? { executionResult } : requestSink.getObservedResult(operation);
    }
  };
}

function createBatchReleaseBarrier(
  batch: ReadonlyArray<IBatchEntry>,
  releaseAsync: () => Promise<void>
): () => Promise<void> {
  // Entries that already started their result (e.g. published early) never arrive at the barrier.
  let remaining: number = batch.filter((entry) => !entry.completed && !entry.finishPromise).length;
  if (remaining === 0) return releaseAsync;
  let arrive: () => void = () => undefined;
  const allDrained: Promise<void> = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const released: Promise<void> = allDrained.then(releaseAsync);
  return async () => {
    if (--remaining === 0) arrive();
    await released;
  };
}

function getDualEmitGraph(workspaceSession: IWorkspaceSession): IDualEmitOperationGraph {
  const graph: IOperationGraph | undefined = workspaceSession.operationGraph;
  if (!graph) {
    throw new Error('The workspace session does not provide a reusable operation graph.');
  }
  if (!('eventSink' in graph)) {
    throw new Error('The workspace operation graph does not support Rush dual-emit events.');
  }
  return graph as IDualEmitOperationGraph;
}

function getGraphEventSink(graph: IDualEmitOperationGraph): _IOperationGraphEventSink | undefined {
  return graph.eventSink;
}

function setGraphEventSink(
  graph: IDualEmitOperationGraph,
  eventSink: _IOperationGraphEventSink | undefined
): void {
  graph.eventSink = eventSink;
}

/** Changes native manual mode while the caller owns graph admission. @internal */
export function setPauseNextIteration(graph: IOperationGraph, pauseNextIteration: boolean): void {
  graph.pauseNextIteration = pauseNextIteration;
}

function getGraphRoutingState(
  graph: IDualEmitOperationGraph,
  workspaceSession: IWorkspaceSession
): IGraphRoutingState {
  let state: IGraphRoutingState | undefined = ROUTING_STATE_BY_GRAPH.get(graph);
  if (!state) {
    const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer(
      getGraphEventSink(graph)
    );
    graph.hooks.onIterationScheduled.tap('rushd request event multiplexer', (records) => {
      multiplexer.onIterationScheduled(records.values());
    });
    const graphExecutionScheduler: RequestScheduler = new RequestScheduler();
    state = {
      coordinator: new PhasedRequestBatchCoordinator(
        graph,
        graphExecutionScheduler,
        multiplexer,
        workspaceSession
      ),
      multiplexer
    };
    ROUTING_STATE_BY_GRAPH.set(graph, state);
    setGraphEventSink(graph, multiplexer);
  } else if (getGraphEventSink(graph) !== state.multiplexer) {
    throw new Error('The workspace operation graph event sink changed after routing began.');
  }
  return state;
}

function validateRequestIdentity(request: IDaemonPhasedRequest): void {
  validateNonemptyName(request.requestId, 'request id');
  validateNonemptyName(request.commandName, 'command name');
  if (
    request.commandOrigin !== undefined &&
    request.commandOrigin !== 'built-in' &&
    request.commandOrigin !== 'custom'
  ) {
    throw new Error('Phased request command origin is not recognized.');
  }
  if (request.acceptsStdin !== undefined && typeof request.acceptsStdin !== 'boolean') {
    throw new Error('Phased request acceptsStdin must be a boolean value.');
  }
  if (request.returnEarlyOnFailure !== undefined && typeof request.returnEarlyOnFailure !== 'boolean') {
    throw new Error('Phased request returnEarlyOnFailure must be a boolean value.');
  }
  if (
    request.terminalRequirement !== undefined &&
    request.terminalRequirement !== 'none' &&
    request.terminalRequirement !== 'interactiveInput' &&
    request.terminalRequirement !== 'controllingTerminal'
  ) {
    throw new Error('Phased request terminal requirement is not recognized.');
  }
  if (request.terminalRequirement === 'interactiveInput' && request.acceptsStdin !== true) {
    throw new Error('Phased request interactive input requires acceptsStdin to be true.');
  }
}

/**
 * Returns the key that decides which requests can share one graph iteration.
 *
 * @remarks
 * An operation that several participants select runs once, in the first participant's environment, and hashes its
 * `dependsOnEnvVars` from that environment. Variables that do not select a daemon, such as `WT_SESSION`, reach the
 * operation from each request, so the key includes this request's value of every variable that an operation of the
 * graph lists in `dependsOnEnvVars`. Requests that disagree on one of them get separate iterations, and each
 * operation runs and is hashed as it would be for its own requester. The key takes each value as the operation hashes
 * it, so an unset variable and an empty one are the same value.
 */
function getRequestSettingsKey(
  graph: IOperationGraph,
  request: IDaemonPhasedRequest,
  requestSettings: IPhasedCommandEngineRequestSettings | undefined
): string {
  const names: ReadonlyArray<string> = getGraphDependsOnEnvVars(graph);
  const environment: Readonly<Record<string, string>> =
    names.length > 0 ? getWorkspaceRequestOperationEnvironment(process.env, request.environment) : {};
  // InputsSnapshot hashes `environment[name] || ''`.
  const values: ReadonlyArray<readonly [string, string]> = names.map((name: string) => [
    name,
    environment[name] || ''
  ]);
  return JSON.stringify([requestSettings ?? null, values]);
}

/** Returns the names of the environment variables that the graph's operations hash, sorted. */
function getGraphDependsOnEnvVars(graph: IOperationGraph): ReadonlyArray<string> {
  const names: Set<string> = new Set();
  for (const operation of graph.operations) {
    for (const name of operation.settings?.dependsOnEnvVars ?? []) {
      names.add(name);
    }
  }
  return Array.from(names).sort(Sort.compareByValue);
}

/**
 * The lookups that attribute each operation of an iteration to one of its participants.
 */
type IOperationParticipantLookups = Required<
  Pick<IOperationGraphIterationOptions, 'getOperationEnvironment' | 'getOperationRequestId'>
>;

/**
 * Attributes each operation of an iteration to the first participant that selected it, as a native command would
 * run it for its invoker, or to the first participant if no participant selected it. `getOperationEnvironment`
 * returns that participant's environment and `getOperationRequestId` its request id, so a plugin can attribute the
 * operation to the request whose environment it ran in. An operation that several participants share runs once, in
 * the first participant's environment; the participants agree on the hashed value of every variable that an
 * operation hashes (see `getRequestSettingsKey`).
 *
 * @remarks
 * Each environment is a copy of the daemon's `process.env` in which the variables that do not select a daemon take
 * the participant's values. The copy is taken when it is asked for, so an operation starts from `process.env` as it
 * is when the operation starts, as a native command's operation does. That includes the variables that a plugin
 * sets, changes or deletes in the same iteration's `beforeExecuteIterationAsync`. Reading `process.env` is slow, and
 * the graph hashes every operation while it schedules an iteration, so the calls made before the next microtask
 * share one copy for each participant.
 */
function createOperationParticipantLookups(
  participants: ReadonlyArray<IBatchEntry>
): IOperationParticipantLookups {
  const entryByOperation: Map<Operation, IBatchEntry> = new Map();
  for (const entry of participants) {
    for (const operation of entry.selection.activeOperations) {
      if (!entryByOperation.has(operation)) {
        entryByOperation.set(operation, entry);
      }
    }
  }
  const firstEntry: IBatchEntry | undefined = participants[0];
  const getEntry = (operation: Operation): IBatchEntry | undefined =>
    entryByOperation.get(operation) ?? firstEntry;
  let environmentByEntry: Map<IBatchEntry, Readonly<Record<string, string>>> | undefined;
  return {
    getOperationEnvironment: (operation: Operation) => {
      const entry: IBatchEntry | undefined = getEntry(operation);
      if (!entry) {
        return process.env;
      }
      if (!environmentByEntry) {
        environmentByEntry = new Map();
        queueMicrotask(() => {
          environmentByEntry = undefined;
        });
      }
      let environment: Readonly<Record<string, string>> | undefined = environmentByEntry.get(entry);
      if (!environment) {
        environment = getWorkspaceRequestOperationEnvironment(process.env, entry.request.environment);
        environmentByEntry.set(entry, environment);
      }
      return environment;
    },
    getOperationRequestId: (operation: Operation) => getEntry(operation)?.request.requestId
  };
}

function validateNonemptyName(value: string, kind: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`Invalid phased request ${kind}: "${value}".`);
  }
}

function validateEngineShape(
  requestShape: IDaemonPhasedEngineShape,
  workspaceShape: IWorkspaceEngineShape | undefined
): void {
  if (!workspaceShape) {
    throw new Error('The workspace session does not declare a reusable engine shape.');
  }
  validateNameSet(requestShape.phaseNames, workspaceShape.phaseNames, 'phase');
  validateNameSet(requestShape.pluginNames, workspaceShape.pluginNames, 'plugin');
}

function validateNameSet(
  requestedNames: ReadonlyArray<string>,
  workspaceNames: ReadonlyArray<string>,
  kind: string
): void {
  const requested: Set<string> = new Set(requestedNames);
  if (
    requested.size !== requestedNames.length ||
    requested.size !== workspaceNames.length ||
    workspaceNames.some((name: string) => !requested.has(name))
  ) {
    throw new Error(`The phased request ${kind} shape does not match the warm workspace engine.`);
  }
}

function indexOperations(operations: ReadonlySet<Operation>): ReadonlyMap<string, Operation> {
  const operationById: Map<string, Operation> = new Map();
  for (const operation of operations) {
    const operationId: string = operation.name;
    if (operationById.has(operationId)) {
      throw new Error(`The workspace graph contains duplicate operation id "${operationId}".`);
    }
    operationById.set(operationId, operation);
  }
  return operationById;
}

function resolveSelection(
  requestedSelection: ReadonlyArray<IDaemonPhasedOperationSelection>,
  operationById: ReadonlyMap<string, Operation>,
  exact: boolean
): IResolvedSelection {
  if (!exact && requestedSelection.length === 0) {
    throw new Error('A phased request must select at least one operation.');
  }
  const selectedIds: Set<string> = new Set();
  const enabledOperations: Operation[] = [];
  const ignoreDependencyOperations: Operation[] = [];
  for (const selection of requestedSelection) {
    validateNonemptyName(selection.operationId, 'operation id');
    if (selectedIds.has(selection.operationId)) {
      throw new Error(`Duplicate phased request operation id "${selection.operationId}".`);
    }
    selectedIds.add(selection.operationId);
    const operation: Operation | undefined = operationById.get(selection.operationId);
    if (!operation) {
      throw new Error(`Unknown phased request operation id "${selection.operationId}".`);
    }
    addSelectedOperation(selection.enabledState, operation, enabledOperations, ignoreDependencyOperations);
  }
  return {
    activeOperations: exact
      ? [...enabledOperations, ...ignoreDependencyOperations]
      : collectSelectionClosure(enabledOperations, ignoreDependencyOperations),
    enabledOperations,
    ignoreDependencyOperations,
    exact
  };
}

function addSelectedOperation(
  enabledState: unknown,
  operation: Operation,
  enabledOperations: Operation[],
  ignoreDependencyOperations: Operation[]
): void {
  if (enabledState === true) {
    enabledOperations.push(operation);
  } else if (enabledState === 'ignore-dependency-changes') {
    ignoreDependencyOperations.push(operation);
  } else {
    throw new Error(`Invalid phased request enabled state: "${String(enabledState)}".`);
  }
}

function collectSelectionClosure(
  enabledOperations: ReadonlyArray<Operation>,
  ignoreDependencyOperations: ReadonlyArray<Operation>
): ReadonlyArray<Operation> {
  const activeOperations: Set<Operation> = new Set([...enabledOperations, ...ignoreDependencyOperations]);
  for (const operation of activeOperations) {
    for (const dependency of operation.dependencies) {
      activeOperations.add(dependency);
    }
  }
  return Array.from(activeOperations);
}

/**
 * The operations whose results decide a request's outcome: those of the selected projects that no other selected
 * project consumes, such as the projects named by `--to`. The other selected operations only feed them.
 *
 * @remarks
 * Projects rather than operations are compared, because an operation that nothing consumes, such as the last
 * phase of a dependency, still only serves a consuming project's request.
 */
function getTargetOperationIds(activeOperations: ReadonlyArray<Operation>): ReadonlySet<string> {
  const active: ReadonlySet<Operation> = new Set(activeOperations);
  const consumedProjects: Set<Operation['associatedProject']> = new Set();
  for (const consumer of activeOperations) {
    for (const dependency of consumer.dependencies) {
      if (active.has(dependency) && dependency.associatedProject !== consumer.associatedProject) {
        consumedProjects.add(dependency.associatedProject);
      }
    }
  }
  const targetOperationIds: Set<string> = new Set();
  for (const operation of activeOperations) {
    if (!consumedProjects.has(operation.associatedProject)) {
      targetOperationIds.add(operation.name);
    }
  }
  return targetOperationIds;
}

/** Presentation/scheduling settings are request-scoped, so they are applied per iteration, not per graph. */
function applyRequestSettings(
  graph: IOperationGraph,
  settings: IPhasedCommandEngineRequestSettings | undefined
): void {
  if (settings) {
    graph.quietMode = settings.quietMode;
    graph.parallelism = settings.parallelism;
  }
}

function applySelections(graph: IOperationGraph, selections: ReadonlyArray<IResolvedSelection>): void {
  const enabledClosureBySelection: ReadonlyArray<ReadonlySet<Operation>> = selections.map(
    (selection: IResolvedSelection) =>
      new Set(
        selection.exact
          ? selection.enabledOperations
          : collectSelectionClosure(selection.enabledOperations, [])
      )
  );
  const effectiveIgnoreDependencyOperations: Operation[] = [];
  selections.forEach((selection: IResolvedSelection, selectionIndex: number) => {
    for (const operation of selection.ignoreDependencyOperations) {
      const requiredByAnotherSelection: boolean = enabledClosureBySelection.some(
        (enabledClosure: ReadonlySet<Operation>, enabledSelectionIndex: number) =>
          enabledSelectionIndex !== selectionIndex && enabledClosure.has(operation)
      );
      if (!requiredByAnotherSelection) {
        effectiveIgnoreDependencyOperations.push(operation);
      }
    }
  });
  graph.setEnabledStates(graph.operations, false, 'unsafe');
  for (const selection of selections) {
    graph.setEnabledStates(
      selection.ignoreDependencyOperations,
      'ignore-dependency-changes',
      selection.exact ? 'unsafe' : 'safe'
    );
  }
  for (const selection of selections) {
    graph.setEnabledStates(selection.enabledOperations, true, selection.exact ? 'unsafe' : 'safe');
  }
  graph.setEnabledStates(effectiveIgnoreDependencyOperations, 'ignore-dependency-changes', 'unsafe');
}

/**
 * Reports the outcome of each of a client's operations for its result.
 *
 * @remarks
 * `aborted` means that the client cancelled the request, or the daemon shut down, after the request joined an
 * iteration. Such a request never reports a result that an earlier iteration left, which would report an operation
 * that the cancel kept from starting as failed or succeeded. Once the iteration has ended, the request reports each
 * operation's record in it, which holds the operation's final status in that iteration. The graph keeps that record
 * only for an operation that ran, and an earlier iteration's record for one that was aborted or skipped.
 */
function collectOperationOutcomes(
  activeOperations: ReadonlyArray<Operation>,
  graph: IOperationGraph,
  requestSink: PhasedRequestEventSink,
  aborted: boolean = false,
  report: OperationReport = 'final'
): ReadonlyArray<IPhasedOperationOutcome> {
  const outcomes: IPhasedOperationOutcome[] = [];
  for (const operation of [...activeOperations].sort(compareOperations)) {
    const observed: ReturnType<PhasedRequestEventSink['getObservedResult']> =
      requestSink.getObservedResult(operation);
    const retained: IOperationExecutionResult | undefined = aborted
      ? undefined
      : graph.resultByOperation.get(operation);
    const current: IOperationExecutionResult | undefined =
      report === 'running' || (aborted && report === 'final')
        ? requestSink.getScheduledResult(operation)
        : undefined;
    let status: string | undefined;
    let errorMessage: string | undefined;
    if (current !== undefined) {
      if (current.silent && IN_PROGRESS_STATUSES.has(current.status)) {
        // An operation that runs nothing, for example a phase that the project does not define.
        continue;
      }
      status = current.status;
      errorMessage = current.error?.message;
    } else if (report !== 'final' && observed !== undefined) {
      // While the iteration still runs, retained results may predate this iteration, and work this client
      // stopped observing before it finished (a detached cancellation) was abandoned.
      status = IN_PROGRESS_STATUSES.has(observed.status) ? OperationStatus.Aborted : observed.status;
      errorMessage = observed.executionResult.error?.message;
    } else if (
      observed !== undefined &&
      (retained === undefined || OBSERVED_STATUS_OVERRIDES_RETAINED.has(observed.status))
    ) {
      status = observed.status;
      errorMessage = observed.executionResult.error?.message;
    } else {
      status = retained?.status ?? observed?.status;
      errorMessage = retained?.error?.message ?? observed?.executionResult.error?.message;
    }
    status ??= aborted ? OperationStatus.Aborted : undefined;
    if (aborted && status !== undefined && IN_PROGRESS_STATUSES.has(status)) {
      // The client stopped observing before this operation finished, e.g. because it was terminated.
      status = OperationStatus.Aborted;
    }
    if (status === undefined) {
      continue;
    }
    outcomes.push({
      observedInCurrentIteration: observed !== undefined,
      result: { operationId: operation.name, status, errorMessage },
      warningsAreAllowed: operation.runner?.warningsAreAllowed ?? false
    });
  }
  return outcomes;
}

function compareOperations(left: Operation, right: Operation): number {
  return Sort.compareByValue(left.name, right.name);
}

function getClientGraphStatus(
  aborted: boolean,
  operationOutcomes: ReadonlyArray<IPhasedOperationOutcome>
): OperationStatus {
  if (
    operationOutcomes.some(
      ({ result }: IPhasedOperationOutcome) =>
        result.status === OperationStatus.Failure || result.status === OperationStatus.Blocked
    )
  ) {
    return OperationStatus.Failure;
  }
  if (aborted) {
    return OperationStatus.Aborted;
  }
  if (
    operationOutcomes.some(({ result }: IPhasedOperationOutcome) => result.status === OperationStatus.Aborted)
  ) {
    return OperationStatus.Aborted;
  }
  if (
    operationOutcomes.some(
      ({ result }: IPhasedOperationOutcome) => result.status === OperationStatus.SuccessWithWarning
    )
  ) {
    return OperationStatus.SuccessWithWarning;
  }
  return OperationStatus.Success;
}

async function writeAbortedResultAsync(
  requestId: string,
  client: IPhasedRequestClient,
  interactiveSession: IInteractiveRequestSession | undefined,
  admissionErrorCode?: ReturnType<typeof getRequestAdmissionErrorCode>
): Promise<IDaemonPhasedRequestResult> {
  const cleanupErrors: unknown[] = [];
  await collectInteractiveCleanupErrorAsync(interactiveSession, cleanupErrors);
  const result: IDaemonPhasedRequestResult = {
    ...createPhasedCommandResult({
      aborted: true,
      error: combineErrors(getDaemonShutdownReason(client.abortSignal), cleanupErrors),
      graphStatus: OperationStatus.Aborted,
      operationOutcomes: [],
      requestId,
      scheduled: false,
      warningsAllowedByEnvironment: false
    }),
    ...(admissionErrorCode === undefined ? {} : { admissionErrorCode })
  };
  await client.writeResultAsync(result);
  return result;
}

function validateInteractiveSession(
  request: IDaemonPhasedRequest,
  client: IPhasedRequestClient
): IInteractiveRequestSession | undefined {
  const session: IInteractiveRequestSession | undefined = client.interactiveSession;
  if (session && session.requestId !== request.requestId) {
    throw new Error('The interactive input session does not belong to the phased request.');
  }
  if (request.acceptsStdin === true && !session) {
    throw new Error('The interactive phased request does not have a registered input session.');
  }
  if (request.acceptsStdin === true && !client.interactiveInputSink) {
    throw new Error('The interactive phased request does not have an input sink bridge.');
  }
  return session;
}

function attachInteractiveInput(
  request: IDaemonPhasedRequest,
  client: IPhasedRequestClient,
  session: IInteractiveRequestSession | undefined
): Disposable | undefined {
  if (request.acceptsStdin !== true) {
    return undefined;
  }
  if (!session || !client.interactiveInputSink) {
    throw new Error('The interactive phased request input bridge is unavailable.');
  }
  return session.attachInputSink(client.interactiveInputSink);
}

async function collectInteractiveCleanupErrorAsync(
  session: IInteractiveRequestSession | undefined,
  cleanupErrors: unknown[]
): Promise<void> {
  try {
    await session?.finishAsync();
  } catch (error) {
    cleanupErrors.push(error);
  }
}

async function finishAfterRoutingErrorAsync(
  session: IInteractiveRequestSession | undefined,
  routingError: unknown
): Promise<never> {
  try {
    await session?.finishAsync();
  } catch (cleanupError) {
    throw new AggregateError(
      [routingError, cleanupError],
      'The phased request failed and could not restore its interactive terminal state.'
    );
  }
  throw routingError;
}

async function finishAfterAdmissionErrorAsync(
  request: IDaemonPhasedRequest,
  client: IPhasedRequestClient,
  interactiveSession: IInteractiveRequestSession | undefined,
  admissionError: unknown
): Promise<IDaemonPhasedRequestResult> {
  if (!(admissionError instanceof RequestSchedulerError)) {
    return await finishAfterRoutingErrorAsync(interactiveSession, admissionError);
  }
  const admissionErrorCode: ReturnType<typeof getRequestAdmissionErrorCode> =
    getRequestAdmissionErrorCode(admissionError);
  if (admissionError.code === RequestSchedulerErrorCode.Aborted) {
    return await writeAbortedResultAsync(request.requestId, client, interactiveSession, admissionErrorCode);
  }
  const cleanupErrors: unknown[] = [];
  await collectInteractiveCleanupErrorAsync(interactiveSession, cleanupErrors);
  const result: IDaemonPhasedRequestResult = {
    ...createPhasedCommandResult({
      aborted: false,
      error: combineErrors(admissionError, cleanupErrors),
      graphStatus: OperationStatus.Ready,
      operationOutcomes: [],
      requestId: request.requestId,
      scheduled: false,
      warningsAllowedByEnvironment: false
    }),
    admissionErrorCode
  };
  await client.writeResultAsync(result);
  return result;
}

function combineErrors(executionError: unknown, allCleanupErrors: unknown[]): unknown {
  // Cleanup that fails with the same daemon shutdown reason (for example, restoring raw mode after the
  // interactive connection closed) must not hide that reason from the client.
  const cleanupErrors: unknown[] =
    executionError instanceof DaemonShutdownError
      ? allCleanupErrors.filter((error: unknown) => !(error instanceof DaemonShutdownError))
      : allCleanupErrors;
  if (executionError !== undefined && cleanupErrors.length > 0) {
    return new AggregateError(
      [executionError, ...cleanupErrors],
      'The phased request failed and could not clean up its client subscription.'
    );
  }
  if (executionError !== undefined) {
    return executionError;
  }
  if (cleanupErrors.length === 1) {
    return cleanupErrors[0];
  }
  if (cleanupErrors.length > 1) {
    return new AggregateError(cleanupErrors, 'Failed to clean up the phased request client subscription.');
  }
  return undefined;
}
