// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IOperationExecutionResult,
  IOperationGraph,
  Operation,
  _IOperationGraphEventSink
} from '@microsoft/rush-lib';
import { OperationStatus } from '@microsoft/rush-lib';
import type {
  IDaemonPhasedEngineShape,
  IDaemonPhasedOperationSelection,
  IDaemonPhasedRequest,
  IDaemonPhasedRequestResult,
  IDaemonTerminalPolicyResult
} from '@rushstack/rush-daemon-protocol';

import { PhasedRequestEventSink } from './PhasedRequestEventSink';
import { PhasedRequestEventMultiplexer } from './PhasedRequestEventMultiplexer';
import type { IPhasedRequestClient } from './PhasedRequestClient';
import {
  DaemonRequiresInProcessError,
  evaluateDaemonTerminalPolicy
} from './DaemonTerminalPolicy';
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
  RequestAdmissionController
} from './WorkspaceRequestAdmission';
import type { IWorkspaceEngineShape } from './WorkspaceEngineComponentFactory';
import type { IWorkspaceSession } from './WorkspaceSession';
import {
  createPhasedCommandResult,
  type IPhasedOperationOutcome,
  parseWarningsAllowedByEnvironment
} from './CommandResultPolicy';

interface IDualEmitOperationGraph extends IOperationGraph {
  eventSink: _IOperationGraphEventSink | undefined;
}

interface IResolvedSelection {
  readonly activeOperations: ReadonlyArray<Operation>;
  readonly enabledOperations: ReadonlyArray<Operation>;
  readonly ignoreDependencyOperations: ReadonlyArray<Operation>;
}

interface IGraphRoutingState {
  readonly coordinator: PhasedRequestBatchCoordinator;
  readonly multiplexer: PhasedRequestEventMultiplexer;
}

interface IPreparedPhasedRequest {
  readonly client: IPhasedRequestClient;
  readonly exclusivityClass: RequestExclusivityClass;
  readonly interactiveSession: IInteractiveRequestSession | undefined;
  readonly request: IDaemonPhasedRequest;
  readonly selection: IResolvedSelection;
  readonly warningsAllowedByEnvironment: boolean;
}

interface IBatchEntry extends IPreparedPhasedRequest {
  abortListener: (() => void) | undefined;
  abortRequested: boolean;
  completed: boolean;
  executionStarted: boolean;
  outputError: unknown;
  participated: boolean;
  reject: (error: unknown) => void;
  requestSink: PhasedRequestEventSink | undefined;
  resolve: (result: IDaemonPhasedRequestResult) => void;
  unsubscribe: (() => void) | undefined;
}

const ROUTING_STATE_BY_GRAPH: WeakMap<IOperationGraph, IGraphRoutingState> = new WeakMap();

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

  /** Validates and executes one resolved phased request against the warm graph. */
  public async executeAsync(
    request: IDaemonPhasedRequest,
    client: IPhasedRequestClient
  ): Promise<IDaemonPhasedRequestResult> {
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
    const exclusivityClass: RequestExclusivityClass = classifyRushCommand({
      commandName: request.commandName,
      commandOrigin: request.commandOrigin
    });
    let admissionController: RequestAdmissionController | undefined;
    let admissionLease: IRequestLease;
    try {
      admissionController = new RequestAdmissionController({
        admission: request.admission,
        client,
        requestId: request.requestId
      });
      admissionLease = await admissionController.acquireAsync(
        getWorkspaceRequestScheduler(this.#workspaceSession),
        exclusivityClass
      );
    } catch (error) {
      admissionController?.dispose();
      return await finishAfterAdmissionErrorAsync(request, client, interactiveSession, error);
    }

    try {
      let inputAttachment: Disposable | undefined;
      try {
        inputAttachment = attachInteractiveInput(request, client, interactiveSession);
        try {
          validateEngineShape(request.engineShape, this.#workspaceSession.engineShape);
          const operationById: ReadonlyMap<string, Operation> = indexOperations(graph.operations);
          const selection: IResolvedSelection = resolveSelection(request.operationSelection, operationById);
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
          return await routingState.coordinator.enqueueAsync(
            {
              client,
              exclusivityClass,
              interactiveSession,
              request,
              selection,
              warningsAllowedByEnvironment
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
  #currentBatch: ReadonlyArray<IBatchEntry> | undefined;
  #drainScheduled: boolean = false;
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
      const graphWaitLease: IRequestLease = await admissionController.acquireAsync(
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
        completed: false,
        executionStarted: false,
        outputError: undefined,
        participated: false,
        reject,
        requestSink: undefined,
        resolve,
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
      while (this.#pending.length > 0) {
        const first: IBatchEntry = this.#pending.shift()!;
        const batch: IBatchEntry[] = [first];
        if (first.exclusivityClass === RequestExclusivityClass.SharedBuild) {
          this.#takeCompatiblePending(batch);
        }
        this.#currentBatch = batch;
        this.#acceptingCurrentBatch =
          first.exclusivityClass === RequestExclusivityClass.SharedBuild;
        for (const entry of batch) {
          entry.executionStarted = true;
        }
        try {
          await this.#executeBatchAsync(batch);
        } catch (error) {
          await Promise.all(batch.map((entry: IBatchEntry) => this.#rejectEntryAsync(entry, error)));
        } finally {
          this.#acceptingCurrentBatch = false;
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
    if (!this.#running) {
      return true;
    }
    return (
      this.#acceptingCurrentBatch &&
      request.exclusivityClass === RequestExclusivityClass.SharedBuild &&
      this.#currentBatch?.[0]?.exclusivityClass === RequestExclusivityClass.SharedBuild
    );
  }

  #takeCompatiblePending(batch: IBatchEntry[]): void {
    for (let index: number = 0; index < this.#pending.length; ) {
      const entry: IBatchEntry = this.#pending[index];
      if (entry.exclusivityClass === RequestExclusivityClass.SharedBuild) {
        this.#pending.splice(index, 1);
        entry.executionStarted = true;
        batch.push(entry);
      } else {
        index++;
      }
    }
  }

  async #executeBatchAsync(batch: IBatchEntry[]): Promise<void> {
    const graphLeasePromise: Promise<IRequestLease> = this.#graphExecutionScheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    const graphLease: IRequestLease = await graphLeasePromise;
    try {
      if (this.#graph.hasScheduledIteration || this.#graph.status === OperationStatus.Executing) {
        throw new Error('The warm workspace operation graph is not idle.');
      }
      await this.#workspaceSession.reconcileInvalidationsAsync();

      if (batch[0].exclusivityClass === RequestExclusivityClass.SharedBuild) {
        this.#takeCompatiblePending(batch);
      }
      this.#acceptingCurrentBatch = false;
      const participants: IBatchEntry[] = batch.filter((entry: IBatchEntry) =>
        this.#isEntryLive(entry)
      );
      if (participants.length === 0) {
        await Promise.all(
          batch.map((entry: IBatchEntry) => this.#finishEntryAsync(entry, false, undefined))
        );
        return;
      }

      applySelections(
        this.#graph,
        participants.map((entry: IBatchEntry) => entry.selection)
      );
      for (const entry of participants) {
        entry.participated = true;
        const activeOperationIds: ReadonlySet<string> = new Set(
          entry.selection.activeOperations.map((operation: Operation) => operation.name)
        );
        entry.requestSink = new PhasedRequestEventSink({
          activeOperationIds,
          client: entry.client,
          getNextSequence: () => entry.client.getNextEventSequence(),
          onWriteFailure: (error: Error) => this.#deactivateEntry(entry, false, error),
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
        scheduled = await this.#graph.scheduleIterationAsync({
          inputsSnapshot: this.#workspaceSession.inputsSnapshot
        });
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
          const executionPromise: Promise<boolean> = this.#graph.executeScheduledIterationAsync();
          if (!participants.some((entry: IBatchEntry) => this.#isEntryLive(entry))) {
            // Let executeScheduledIterationAsync promote the scheduled iteration before aborting it.
            await Promise.resolve();
            this.#requestIterationAbort();
            await this.#abortTail;
          }
          await executionPromise;
        }
      } catch (error) {
        executionError = error;
        if (this.#graph.hasScheduledIteration) {
          try {
            const failedExecutionPromise: Promise<boolean> =
              this.#graph.executeScheduledIterationAsync();
            await Promise.resolve();
            this.#requestIterationAbort();
            await this.#abortTail;
            await failedExecutionPromise;
          } catch (cleanupError) {
            iterationCleanupErrors.push(cleanupError);
          }
        }
      } finally {
        for (const entry of participants) {
          entry.unsubscribe?.();
          entry.unsubscribe = undefined;
        }
        setPauseNextIteration(this.#graph, previousPauseNextIteration);
      }

      await this.#abortTail;
      iterationCleanupErrors.push(...this.#abortErrors.splice(0));
      await Promise.all(
        batch.map((entry: IBatchEntry) =>
          this.#finishEntryAsync(entry, scheduled, executionError, iterationCleanupErrors)
        )
      );
    } finally {
      graphLease.release();
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
      this.#currentBatch &&
      (this.#graph.hasScheduledIteration || this.#graph.status === OperationStatus.Executing) &&
      !this.#currentBatch.some((candidate: IBatchEntry) => this.#isEntryLive(candidate))
    ) {
      this.#requestIterationAbort();
    }
  }

  #isEntryLive(entry: IBatchEntry): boolean {
    return !entry.abortRequested && !entry.client.abortSignal.aborted && entry.outputError === undefined;
  }

  #requestIterationAbort(): void {
    const abortPromise: Promise<void> = this.#graph.abortCurrentIterationAsync();
    this.#abortTail = Promise.all([this.#abortTail, abortPromise])
      .then(() => undefined)
      .catch((error: unknown) => {
        this.#abortErrors.push(error);
      });
  }

  async #finishEntryAsync(
    entry: IBatchEntry,
    batchScheduled: boolean,
    executionError: unknown,
    batchCleanupErrors: ReadonlyArray<unknown> = []
  ): Promise<void> {
    if (entry.completed) {
      return;
    }
    const cleanupErrors: unknown[] = [...batchCleanupErrors];
    if (entry.requestSink) {
      try {
        await entry.requestSink.flushAsync();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    await collectInteractiveCleanupErrorAsync(entry.interactiveSession, cleanupErrors);
    const aborted: boolean = entry.abortRequested || entry.client.abortSignal.aborted;
    const operationOutcomes: ReadonlyArray<IPhasedOperationOutcome> = entry.requestSink
      ? collectOperationOutcomes(
          entry.selection.activeOperations,
          this.#graph,
          entry.requestSink,
          aborted && entry.participated
        )
      : [];
    const result: IDaemonPhasedRequestResult = createPhasedCommandResult({
      aborted,
      error: combineErrors(executionError, cleanupErrors),
      graphStatus: getClientGraphStatus(aborted, operationOutcomes),
      operationOutcomes,
      requestId: entry.request.requestId,
      scheduled: entry.participated && batchScheduled,
      warningsAllowedByEnvironment: entry.warningsAllowedByEnvironment
    });
    try {
      await entry.client.writeResultAsync(result);
      this.#completeEntry(entry);
      entry.resolve(result);
    } catch (error) {
      this.#completeEntry(entry);
      entry.reject(error);
    }
  }

  async #rejectEntryAsync(entry: IBatchEntry, error: unknown): Promise<void> {
    if (entry.completed) {
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

  #completeEntry(entry: IBatchEntry): void {
    entry.completed = true;
    if (entry.abortListener) {
      entry.client.abortSignal.removeEventListener('abort', entry.abortListener);
      entry.abortListener = undefined;
    }
  }
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

function setPauseNextIteration(graph: IOperationGraph, pauseNextIteration: boolean): void {
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
  operationById: ReadonlyMap<string, Operation>
): IResolvedSelection {
  if (requestedSelection.length === 0) {
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
    activeOperations: collectSelectionClosure(enabledOperations, ignoreDependencyOperations),
    enabledOperations,
    ignoreDependencyOperations
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
  const activeOperations: Set<Operation> = new Set([
    ...enabledOperations,
    ...ignoreDependencyOperations
  ]);
  for (const operation of activeOperations) {
    for (const dependency of operation.dependencies) {
      activeOperations.add(dependency);
    }
  }
  return Array.from(activeOperations);
}

function applySelections(
  graph: IOperationGraph,
  selections: ReadonlyArray<IResolvedSelection>
): void {
  graph.setEnabledStates(graph.operations, false, 'unsafe');
  graph.setEnabledStates(
    selections.flatMap(
      (selection: IResolvedSelection) => selection.ignoreDependencyOperations
    ),
    'ignore-dependency-changes',
    'safe'
  );
  graph.setEnabledStates(
    selections.flatMap((selection: IResolvedSelection) => selection.enabledOperations),
    true,
    'safe'
  );
  graph.setEnabledStates(
    selections.flatMap(
      (selection: IResolvedSelection) => selection.ignoreDependencyOperations
    ),
    'ignore-dependency-changes',
    'unsafe'
  );
}

function collectOperationOutcomes(
  activeOperations: ReadonlyArray<Operation>,
  graph: IOperationGraph,
  requestSink: PhasedRequestEventSink,
  fillMissingAsAborted: boolean = false
): ReadonlyArray<IPhasedOperationOutcome> {
  const outcomes: IPhasedOperationOutcome[] = [];
  for (const operation of [...activeOperations].sort(compareOperations)) {
    const observed: ReturnType<PhasedRequestEventSink['getObservedResult']> =
      requestSink.getObservedResult(operation);
    const retained: IOperationExecutionResult | undefined = graph.resultByOperation.get(operation);
    const status: string | undefined =
      retained?.status ??
      observed?.status ??
      (fillMissingAsAborted ? OperationStatus.Aborted : undefined);
    if (status === undefined) {
      continue;
    }
    const errorMessage: string | undefined = observed
      ? observed.executionResult.error?.message
      : retained?.error?.message;
    outcomes.push({
      observedInCurrentIteration: observed !== undefined,
      result: { operationId: operation.name, status, errorMessage },
      warningsAreAllowed: operation.runner?.warningsAreAllowed ?? false
    });
  }
  return outcomes;
}

function compareOperations(left: Operation, right: Operation): number {
  return left.name.localeCompare(right.name);
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
    operationOutcomes.some(
      ({ result }: IPhasedOperationOutcome) => result.status === OperationStatus.Aborted
    )
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
      error: combineErrors(undefined, cleanupErrors),
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
    return await writeAbortedResultAsync(
      request.requestId,
      client,
      interactiveSession,
      admissionErrorCode
    );
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

function combineErrors(executionError: unknown, cleanupErrors: unknown[]): unknown {
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
