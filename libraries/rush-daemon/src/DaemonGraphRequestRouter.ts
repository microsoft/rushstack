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
import { DaemonGraphChanges, getDaemonGraphObserver, snapshotDaemonGraph, type DaemonGraphObserver } from './DaemonGraphObserver';
import { parseDaemonGraphRequest, selectDaemonGraphOperations, type IDaemonGraphRequest } from './DaemonGraphRequest';
import { RequestExclusivityClass, RequestSchedulerError, RequestSchedulerErrorCode, type IRequestLease } from './RequestScheduler';
import {
  getRequestAdmissionErrorCode,
  getWorkspaceRequestScheduler,
  RequestAdmissionController
} from './WorkspaceRequestAdmission';
import type { IWorkspaceSession } from './WorkspaceSession';

const DAEMON_PACKAGE_VERSION: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;

export class DaemonGraphRequestRouter {
  private readonly _session: IWorkspaceSession;

  public constructor(session: IWorkspaceSession) {
    this._session = session;
  }

  public async executeAsync(envelope: IDaemonRequestEnvelope, client: IDaemonRequestDispatchClient): Promise<void> {
    const request: IDaemonGraphRequest = parseDaemonGraphRequest(envelope);
    let result: IDaemonCommandResult;
    try {
      if (request.verb === 'watch') {
        const graph: IOperationGraph = this._requireGraph();
        const changes: DaemonGraphChanges = new DaemonGraphChanges(this._session, graph, client.abortSignal);
        try {
          while (await changes.nextAsync()) {
            await this._writeSnapshotAsync(envelope.requestId, client, snapshotDaemonGraph(this._session));
          }
        } finally {
          changes[Symbol.dispose]();
        }
        result = { requestId: envelope.requestId, exitCode: 130, outcome: 'aborted', aborted: true };
      } else {
        const snapshot: IDaemonGraphSnapshotPayload['snapshot'] =
          request.verb === 'show' || request.verb === 'status'
            ? snapshotDaemonGraph(this._session)
            : await this._mutateAsync(request, envelope, client);
        await this._writeSnapshotAsync(envelope.requestId, client, snapshot);
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
    await client.writeResultAsync(result);
  }

  private async _mutateAsync(
    request: IDaemonGraphRequest,
    envelope: IDaemonRequestEnvelope,
    client: IDaemonRequestDispatchClient
  ): Promise<IDaemonGraphSnapshotPayload['snapshot']> {
    const admission: RequestAdmissionController = new RequestAdmissionController({
      admission: envelope.admission, client, requestId: envelope.requestId
    });
    try {
      const lease: IRequestLease = await admission.acquireAsync(
        getWorkspaceRequestScheduler(this._session), RequestExclusivityClass.Exclusive
      );
      try {
        const graph: IOperationGraph = this._requireGraph();
        if (graph.status === OperationStatus.Executing) {
          throw new DaemonRequestDispatchError('routingFailed', 'Cannot mutate an active graph iteration.');
        }
        const operations: ReadonlySet<Operation> = selectDaemonGraphOperations(request, graph);
        if (request.verb === 'pause') {
          graph.pauseNextIteration = true;
        } else if (request.verb === 'resume') {
          await this._resumeAsync(graph);
        } else {
          if (graph.hasScheduledIteration) {
            throw new DaemonRequestDispatchError('routingFailed', 'Cannot change a prepared graph iteration.');
          }
          if (request.verb === 'invalidate') graph.invalidateOperations(operations, 'daemon graph invalidate');
          else graph.setEnabledStates(operations, request.verb === 'scope-in', 'safe');
        }
        return snapshotDaemonGraph(this._session);
      } finally {
        lease.release();
      }
    } finally {
      admission.dispose();
    }
  }

  private async _resumeAsync(graph: IOperationGraph): Promise<void> {
    // The native setter may release an already scheduled automatic iteration. Retain admission until
    // native idle, even if this client disconnects; never execute or cancel that iteration ourselves.
    if (!graph.hasScheduledIteration) {
      graph.pauseNextIteration = false;
      return;
    }
    const observer: DaemonGraphObserver = getDaemonGraphObserver(graph);
    const idleSequence: number = observer.idleSequence;
    const changes: DaemonGraphChanges = new DaemonGraphChanges(this._session, graph, graph.abortController.signal);
    try {
      graph.pauseNextIteration = false;
      while (observer.idleSequence === idleSequence) {
        if (!(await changes.nextAsync())) {
          throw new DaemonRequestDispatchError('routingFailed', 'The graph closed before reaching idle.');
        }
      }
    } finally {
      changes[Symbol.dispose]();
    }
  }

  private _requireGraph(): IOperationGraph {
    const graph: IOperationGraph | undefined = this._session.operationGraph;
    if (!graph || graph.abortController.signal.aborted) {
      throw new DaemonRequestDispatchError(
        'routingFailed', 'The graph is uninitialized or closed. Initialize it with an explicit supported build request.'
      );
    }
    return graph;
  }

  private _writeSnapshotAsync(
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
