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
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerError,
  RequestSchedulerErrorCode
} from './RequestScheduler';
import type { IRequestLease } from './RequestScheduler';
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
  readonly enabledOperations: ReadonlyArray<Operation>;
  readonly ignoreDependencyOperations: ReadonlyArray<Operation>;
}

interface IGraphRoutingState {
  readonly graphExecutionScheduler: RequestScheduler;
  readonly multiplexer: PhasedRequestEventMultiplexer;
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
    const routingState: IGraphRoutingState = getGraphRoutingState(graph);
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
        classifyRushCommand({
          commandName: request.commandName,
          commandOrigin: request.commandOrigin
        })
      );
    } catch (error) {
      admissionController?.dispose();
      return await finishAfterAdmissionErrorAsync(request, client, interactiveSession, error);
    }

    try {
      let graphLease: IRequestLease;
      try {
        graphLease = await admissionController.acquireAsync(
          routingState.graphExecutionScheduler,
          RequestExclusivityClass.Exclusive
        );
      } catch (error) {
        return await finishAfterAdmissionErrorAsync(request, client, interactiveSession, error);
      }
      try {
        try {
          return await this.#executeAdmittedAsync(
            request,
            client,
            graph,
            routingState,
            interactiveSession
          );
        } catch (error) {
          return await finishAfterRoutingErrorAsync(interactiveSession, error);
        }
      } finally {
        graphLease.release();
      }
    } finally {
      admissionLease.release();
      admissionController.dispose();
    }
  }

  async #executeAdmittedAsync(
    request: IDaemonPhasedRequest,
    client: IPhasedRequestClient,
    graph: IDualEmitOperationGraph,
    routingState: IGraphRoutingState,
    interactiveSession: IInteractiveRequestSession | undefined
  ): Promise<IDaemonPhasedRequestResult> {
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
        aborted: false,
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
    if (graph.hasScheduledIteration || graph.status === OperationStatus.Executing) {
      throw new Error('The warm workspace operation graph is not idle.');
    }
    await this.#workspaceSession.reconcileInvalidationsAsync();
    if (client.abortSignal.aborted) {
      return await writeAbortedResultAsync(request.requestId, client, interactiveSession);
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
    await collectInteractiveCleanupErrorAsync(interactiveSession, cleanupErrors);
    await abortTail;
    cleanupErrors.push(...abortErrors.slice(observedAbortErrorCount));
    const result: IDaemonPhasedRequestResult = createPhasedCommandResult({
      aborted: wasAborted || client.abortSignal.aborted,
      error: combineErrors(executionError, cleanupErrors),
      graphStatus: graph.status,
      operationOutcomes: collectOperationOutcomes(activeOperations, graph, requestSink),
      requestId: request.requestId,
      scheduled,
      warningsAllowedByEnvironment
    });
    await client.writeResultAsync(result);
    return result;
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
    state = {
      graphExecutionScheduler: new RequestScheduler(),
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
  if (request.commandOrigin !== 'built-in' && request.commandOrigin !== 'custom') {
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

function collectOperationOutcomes(
  activeOperations: ReadonlyArray<Operation>,
  graph: IOperationGraph,
  requestSink: PhasedRequestEventSink
): ReadonlyArray<IPhasedOperationOutcome> {
  const outcomes: IPhasedOperationOutcome[] = [];
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
  return session;
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
