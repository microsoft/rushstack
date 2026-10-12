// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { OperationStatus, type IOperationGraph, type Operation } from '@microsoft/rush-lib';
import { PackageJsonLookup } from '@rushstack/node-core-library';
import {
  DAEMON_PROTOCOL_VERSION,
  RUSHD_GRAPH_SNAPSHOT,
  type IDaemonCommandResult,
  type IDaemonGraphSnapshotPayload,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

import { DaemonRequestDispatchError, type IDaemonRequestDispatchClient } from './DaemonRequestDispatcher';
import {
  DaemonGraphChanges,
  getDaemonGraphObserver,
  snapshotDaemonGraph,
  type DaemonGraphObserver
} from './DaemonGraphObserver';
import {
  parseDaemonGraphRequest,
  selectDaemonGraphOperations,
  type IDaemonGraphRequest
} from './DaemonGraphRequest';
import {
  RequestExclusivityClass,
  RequestSchedulerError,
  RequestSchedulerErrorCode,
  type IRequestLease
} from './RequestScheduler';
import {
  getRequestAdmissionErrorCode,
  getWorkspaceRequestScheduler,
  RequestAdmissionController
} from './WorkspaceRequestAdmission';
import type { IWorkspaceSession } from './WorkspaceSession';
import { setPauseNextIteration } from './PhasedRequestRouter';
import { getWorkspaceGenerationToken } from './WorkspaceGeneration';
import { type DaemonShutdownError, getDaemonShutdownReason } from './DaemonShutdownError';

const DAEMON_PACKAGE_VERSION: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;

export class DaemonGraphRequestRouter {
  readonly #session: IWorkspaceSession;

  public constructor(session: IWorkspaceSession) {
    this.#session = session;
  }

  public async executeAsync(
    envelope: IDaemonRequestEnvelope,
    client: IDaemonRequestDispatchClient
  ): Promise<void> {
    const request: IDaemonGraphRequest = parseDaemonGraphRequest(envelope);
    let result: IDaemonCommandResult;
    try {
      if (request.verb === 'watch') {
        const graph: IOperationGraph = this.#requireGraph();
        const changes: DaemonGraphChanges = new DaemonGraphChanges(this.#session, graph, client.abortSignal);
        try {
          while (await changes.nextAsync()) {
            await this.#writeSnapshotAsync(envelope.requestId, client, snapshotDaemonGraph(this.#session));
          }
        } finally {
          changes[Symbol.dispose]();
        }
        result = { requestId: envelope.requestId, exitCode: 130, outcome: 'aborted', aborted: true };
      } else {
        const snapshot: IDaemonGraphSnapshotPayload['snapshot'] =
          request.verb === 'show' || request.verb === 'status'
            ? snapshotDaemonGraph(this.#session)
            : await this.#mutateAsync(request, envelope, client);
        await this.#writeSnapshotAsync(envelope.requestId, client, snapshot);
        result = client.abortSignal.aborted
          ? { requestId: envelope.requestId, exitCode: 130, outcome: 'aborted', aborted: true }
          : { requestId: envelope.requestId, exitCode: 0, outcome: 'success', aborted: false };
      }
    } catch (error) {
      if (!(error instanceof RequestSchedulerError)) throw error;
      const aborted: boolean = error.code === RequestSchedulerErrorCode.Aborted;
      result = {
        requestId: envelope.requestId,
        exitCode: aborted ? 130 : 1,
        outcome: aborted ? 'aborted' : 'failure',
        aborted,
        admissionErrorCode: getRequestAdmissionErrorCode(error)
      };
    }
    const shutdownReason: DaemonShutdownError | undefined = result.aborted
      ? getDaemonShutdownReason(client.abortSignal)
      : undefined;
    await client.writeResultAsync(
      shutdownReason ? { ...result, errorMessage: shutdownReason.message } : result
    );
  }

  async #mutateAsync(
    request: IDaemonGraphRequest,
    envelope: IDaemonRequestEnvelope,
    client: IDaemonRequestDispatchClient
  ): Promise<IDaemonGraphSnapshotPayload['snapshot']> {
    const admission: RequestAdmissionController = new RequestAdmissionController({
      admission: envelope.admission,
      client,
      requestId: envelope.requestId
    });
    try {
      const lease: IRequestLease = await admission.acquireAsync(
        getWorkspaceRequestScheduler(this.#session),
        RequestExclusivityClass.Exclusive
      );
      try {
        this.#session.assertActive?.();
        if (envelope.expectedWorkspaceGeneration !== getWorkspaceGenerationToken(this.#session)) {
          throw new DaemonRequestDispatchError(
            'invalidRequest',
            'The graph generation changed or was not supplied; read a fresh snapshot before mutating.'
          );
        }
        const graph: IOperationGraph = this.#requireGraph();
        if (graph.status === OperationStatus.Executing) {
          throw new DaemonRequestDispatchError('routingFailed', 'Cannot mutate an active graph iteration.');
        }
        const operations: ReadonlySet<Operation> = selectDaemonGraphOperations(request, graph);
        if (request.verb === 'pause') {
          setPauseNextIteration(graph, true);
        } else if (request.verb === 'resume') {
          await this.#resumeAsync(graph);
        } else {
          if (graph.hasScheduledIteration) {
            throw new DaemonRequestDispatchError(
              'routingFailed',
              'Cannot change a prepared graph iteration.'
            );
          }
          if (request.verb === 'invalidate')
            graph.invalidateOperations(operations, 'daemon graph invalidate');
          else graph.setEnabledStates(operations, request.verb === 'scope-in', 'safe');
        }
        return snapshotDaemonGraph(this.#session);
      } finally {
        lease.release();
      }
    } finally {
      admission.dispose();
    }
  }

  async #resumeAsync(graph: IOperationGraph): Promise<void> {
    if (!graph.hasScheduledIteration) {
      setPauseNextIteration(graph, false);
      return;
    }
    // Keep prepared work paused while obtaining exclusive native ownership and refreshing its inputs.
    setPauseNextIteration(graph, true);
    const nativeLease: AsyncDisposable | undefined = await this.#session.acquireExecutionLeaseAsync?.();
    try {
      graph.discardScheduledIteration();
      await this.#session.reconcileInvalidationsAsync();
      const scheduled: boolean = await graph.scheduleIterationAsync({
        inputsSnapshot: this.#session.inputsSnapshot
      });
      if (!scheduled) {
        setPauseNextIteration(graph, false);
        return;
      }
      const observer: DaemonGraphObserver = getDaemonGraphObserver(graph);
      const idleSequence: number = observer.idleSequence;
      const changes: DaemonGraphChanges = new DaemonGraphChanges(
        this.#session,
        graph,
        graph.abortController.signal
      );
      try {
        setPauseNextIteration(graph, false);
        while (observer.idleSequence === idleSequence) {
          if (!(await changes.nextAsync())) {
            throw new DaemonRequestDispatchError('routingFailed', 'The graph closed before reaching idle.');
          }
        }
      } finally {
        changes[Symbol.dispose]();
      }
    } finally {
      await nativeLease?.[Symbol.asyncDispose]();
    }
  }

  #requireGraph(): IOperationGraph {
    const graph: IOperationGraph | undefined = this.#session.operationGraph;
    if (!graph || graph.abortController.signal.aborted) {
      throw new DaemonRequestDispatchError(
        'routingFailed',
        'The graph is uninitialized or closed. Initialize it with an explicit supported build request.'
      );
    }
    return graph;
  }

  #writeSnapshotAsync(
    requestId: string,
    client: IDaemonRequestDispatchClient,
    snapshot: IDaemonGraphSnapshotPayload['snapshot']
  ): Promise<void> {
    const sequence: number = client.getNextEventSequence();
    return client.writeEventAsync({
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      eventId: `${client.sessionId}:graph:${sequence}`,
      sessionId: client.sessionId,
      sequence,
      timestamp: new Date().toISOString(),
      source: {
        packageName: '@rushstack/rush-daemon',
        packageVersion: DAEMON_PACKAGE_VERSION,
        component: 'daemon-graph'
      },
      privacy: 'local-sensitive',
      required: true,
      type: 'extension',
      scope: { commandName: 'daemon' },
      payload: { name: RUSHD_GRAPH_SNAPSHOT, data: { requestId, snapshot } }
    });
  }
}
