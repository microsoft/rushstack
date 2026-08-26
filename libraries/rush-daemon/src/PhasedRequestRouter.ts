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
  IDaemonPhasedOperationResult,
  IDaemonPhasedOperationSelection,
  IDaemonPhasedRequest,
  IDaemonPhasedRequestResult
} from '@rushstack/rush-daemon-protocol';

import { PhasedRequestEventSink } from './PhasedRequestEventSink';
import { PhasedRequestEventMultiplexer } from './PhasedRequestEventMultiplexer';
import type { IPhasedRequestClient } from './PhasedRequestClient';
import {
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerError,
  RequestSchedulerErrorCode
} from './RequestScheduler';
import type { IRequestLease } from './RequestScheduler';
import type { IWorkspaceEngineShape } from './WorkspaceEngineComponentFactory';
import type { IWorkspaceSession } from './WorkspaceSession';

interface IDualEmitOperationGraph extends IOperationGraph {
  eventSink: _IOperationGraphEventSink | undefined;
}

interface IResolvedSelection {
  readonly enabledOperations: ReadonlyArray<Operation>;
  readonly ignoreDependencyOperations: ReadonlyArray<Operation>;
}

interface IGraphRoutingState {
  readonly multiplexer: PhasedRequestEventMultiplexer;
  readonly scheduler: RequestScheduler;
}

const ROUTING_STATE_BY_GRAPH: WeakMap<IOperationGraph, IGraphRoutingState> = new WeakMap();

/**
 * Routes one caller-resolved phased request through a real warm workspace operation graph.
 *
 * @remarks
 * Command parsing, plugin loading, and graph construction remain integration-owned. Requests are serialized because
 * shared-build selection merging is a later layer. Cancellation aborts only the current iteration and never closes
 * the daemon-owned graph or its runners.
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
    const graph: IDualEmitOperationGraph = getDualEmitGraph(this.#workspaceSession);
    const routingState: IGraphRoutingState = getGraphRoutingState(graph);
    let lease: IRequestLease;
    try {
      lease = await routingState.scheduler.acquireAsync({
        abortSignal: client.abortSignal,
        exclusivityClass: RequestExclusivityClass.Exclusive
      });
    } catch (error) {
      if (
        error instanceof RequestSchedulerError &&
        error.code === RequestSchedulerErrorCode.Aborted
      ) {
        return createAbortedResult(request.requestId);
      }
      throw error;
    }

    try {
      return await this.#executeAdmittedAsync(request, client, graph, routingState);
    } finally {
      lease.release();
    }
  }

  async #executeAdmittedAsync(
    request: IDaemonPhasedRequest,
    client: IPhasedRequestClient,
    graph: IDualEmitOperationGraph,
    routingState: IGraphRoutingState
  ): Promise<IDaemonPhasedRequestResult> {
    validateRequestIdentity(request);
    validateEngineShape(request.engineShape, this.#workspaceSession.engineShape);
    const operationById: ReadonlyMap<string, Operation> = indexOperations(graph.operations);
    const selection: IResolvedSelection = resolveSelection(request.operationSelection, operationById);

    if (client.abortSignal.aborted) {
      return createAbortedResult(request.requestId);
    }
    if (graph.hasScheduledIteration || graph.status === OperationStatus.Executing) {
      throw new Error('The warm workspace operation graph is not idle.');
    }
    await this.#workspaceSession.reconcileInvalidationsAsync();
    if (client.abortSignal.aborted) {
      return createAbortedResult(request.requestId);
    }

    applySelection(graph, selection);
    const activeOperations: ReadonlyArray<Operation> = Array.from(graph.operations).filter(
      (operation: Operation) => operation.enabled !== false
    );
    const activeOperationIds: ReadonlySet<string> = new Set(
      activeOperations.map((operation: Operation) => operation.name)
    );

    let abortTail: Promise<void> = Promise.resolve();
    const abortErrors: unknown[] = [];
    let wasAborted: boolean = false;
    const abortIteration = (): void => {
      wasAborted = true;
      abortTail = abortTail
        .then(() => graph.abortCurrentIterationAsync())
        .catch((error: unknown) => {
          abortErrors.push(error);
        });
    };
    const previousPauseNextIteration: boolean = graph.pauseNextIteration;
    const requestSink: PhasedRequestEventSink = new PhasedRequestEventSink({
      activeOperationIds,
      client,
      getNextSequence: () => client.getNextEventSequence(),
      onWriteFailure: abortIteration,
      rushVersion: this.#workspaceSession.metadata.rushVersion
    });
    const unsubscribe: () => void = routingState.multiplexer.subscribe(requestSink);
    setPauseNextIteration(graph, true);
    client.abortSignal.addEventListener('abort', abortIteration, { once: true });

    let scheduled: boolean = false;
    let executionError: unknown;
    const iterationCleanupErrors: unknown[] = [];
    try {
      scheduled = await graph.scheduleIterationAsync({
        inputsSnapshot: this.#workspaceSession.inputsSnapshot
      });
      if (scheduled) {
        const executionPromise: Promise<boolean> = graph.executeScheduledIterationAsync();
        if (wasAborted || client.abortSignal.aborted) {
          await Promise.resolve();
          abortIteration();
        }
        await executionPromise;
      }
    } catch (error) {
      executionError = error;
      if (graph.hasScheduledIteration) {
        try {
          const failedExecutionPromise: Promise<boolean> = graph.executeScheduledIterationAsync();
          await Promise.resolve();
          abortIteration();
          await failedExecutionPromise;
        } catch (cleanupError) {
          iterationCleanupErrors.push(cleanupError);
        }
      }
    }

    await abortTail;
    unsubscribe();
    setPauseNextIteration(graph, previousPauseNextIteration);
    client.abortSignal.removeEventListener('abort', abortIteration);
    const cleanupErrors: unknown[] = [...iterationCleanupErrors, ...abortErrors];
    const observedAbortErrorCount: number = abortErrors.length;
    try {
      await requestSink.flushAsync();
    } catch (error) {
      cleanupErrors.push(error);
    }
    await abortTail;
    cleanupErrors.push(...abortErrors.slice(observedAbortErrorCount));
    throwCombinedErrors(executionError, cleanupErrors);

    return {
      aborted: wasAborted || client.abortSignal.aborted,
      operationResults: collectOperationResults(activeOperations, graph, requestSink),
      requestId: request.requestId,
      scheduled
    };
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

function getGraphRoutingState(graph: IDualEmitOperationGraph): IGraphRoutingState {
  let state: IGraphRoutingState | undefined = ROUTING_STATE_BY_GRAPH.get(graph);
  if (!state) {
    const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer(
      getGraphEventSink(graph)
    );
    state = { multiplexer, scheduler: new RequestScheduler() };
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
  return { enabledOperations, ignoreDependencyOperations };
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

function applySelection(graph: IOperationGraph, selection: IResolvedSelection): void {
  graph.setEnabledStates(graph.operations, false, 'unsafe');
  graph.setEnabledStates(
    selection.ignoreDependencyOperations,
    'ignore-dependency-changes',
    'safe'
  );
  graph.setEnabledStates(selection.enabledOperations, true, 'safe');
  graph.setEnabledStates(
    selection.ignoreDependencyOperations,
    'ignore-dependency-changes',
    'unsafe'
  );
}

function collectOperationResults(
  activeOperations: ReadonlyArray<Operation>,
  graph: IOperationGraph,
  requestSink: PhasedRequestEventSink
): ReadonlyArray<IDaemonPhasedOperationResult> {
  const results: IDaemonPhasedOperationResult[] = [];
  for (const operation of [...activeOperations].sort(compareOperations)) {
    const observed: ReturnType<PhasedRequestEventSink['getObservedResult']> =
      requestSink.getObservedResult(operation);
    const retained: IOperationExecutionResult | undefined = graph.resultByOperation.get(operation);
    const status: string | undefined = observed?.status ?? retained?.status;
    if (status === undefined) {
      continue;
    }
    const errorMessage: string | undefined = observed
      ? observed.executionResult.error?.message
      : retained?.error?.message;
    results.push({ operationId: operation.name, status, errorMessage });
  }
  return results;
}

function compareOperations(left: Operation, right: Operation): number {
  return left.name.localeCompare(right.name);
}

function createAbortedResult(requestId: string): IDaemonPhasedRequestResult {
  return { aborted: true, operationResults: [], requestId, scheduled: false };
}

function throwCombinedErrors(executionError: unknown, cleanupErrors: unknown[]): void {
  if (executionError !== undefined && cleanupErrors.length > 0) {
    throw new AggregateError(
      [executionError, ...cleanupErrors],
      'The phased request failed and could not clean up its client subscription.'
    );
  }
  if (executionError !== undefined) {
    throw executionError;
  }
  if (cleanupErrors.length === 1) {
    throw cleanupErrors[0];
  }
  if (cleanupErrors.length > 1) {
    throw new AggregateError(cleanupErrors, 'Failed to clean up the phased request client subscription.');
  }
}
