// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGraph } from '@microsoft/rush-lib';

import { PhasedRequestRouter } from '../PhasedRequestRouter';
import type { IRequestLease } from '../RequestScheduler';
import { RequestAdmissionController } from '../WorkspaceRequestAdmission';
import type { WorkspaceSession } from '../WorkspaceSession';
import {
  DaemonRequestWireClient,
  createDeferred,
  type IDeferred,
  type ITerminalExchange
} from './DaemonRequestWireTestUtilities';
import { createFixtureAsync, runAsync, type IFixture } from './NativeEngineTestFixture';

jest.setTimeout(30_000);

describe('native production daemon engine with a client that is still connecting', () => {
  it('waits under its native lease for a client that is still connecting, whose request then joins the batch', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const leaseRequested: IDeferred<void> = createDeferred();
    const grantLease: IDeferred<void> = createDeferred();
    const secondAdmitted: IDeferred<void> = createDeferred();
    let secondClient: DaemonRequestWireClient | undefined;
    let first: Promise<ITerminalExchange> | undefined;
    let second: Promise<ITerminalExchange> | undefined;
    try {
      await runAsync(fixture, 'initialize', ['build', '--only', 'c']);
      await fixture.session.quiesceWarmSetAsync();
      const graph: IOperationGraph = fixture.session.operationGraph!;
      const scheduleSpy: jest.SpyInstance = jest.spyOn(graph, 'scheduleIterationAsync');
      const acquireExecutionLeaseAsync: WorkspaceSession['acquireExecutionLeaseAsync'] =
        fixture.session.acquireExecutionLeaseAsync.bind(fixture.session);
      jest.spyOn(fixture.session, 'acquireExecutionLeaseAsync').mockImplementationOnce(async () => {
        leaseRequested.resolve();
        await grantLease.promise;
        return await acquireExecutionLeaseAsync();
      });
      const reconcileAsync: WorkspaceSession['reconcileInvalidationsAsync'] =
        fixture.session.reconcileInvalidationsAsync.bind(fixture.session);
      jest.spyOn(fixture.session, 'reconcileInvalidationsAsync').mockImplementationOnce(async () => {
        // Like a slower reconcile, this one lets the second request reach the router before it ends.
        await secondAdmitted.promise;
        await new Promise<void>((resolve) => setImmediate(resolve));
        return await reconcileAsync();
      });
      const routeAsync: PhasedRequestRouter['executeAsync'] = PhasedRequestRouter.prototype.executeAsync;
      let routedRequests: number = 0;
      jest.spyOn(PhasedRequestRouter.prototype, 'executeAsync').mockImplementation(async function (
        this: PhasedRequestRouter,
        ...args: Parameters<PhasedRequestRouter['executeAsync']>
      ) {
        routedRequests++;
        return await routeAsync.apply(this, args);
      });
      const admitAsync: RequestAdmissionController['acquireAsync'] =
        RequestAdmissionController.prototype.acquireAsync;
      jest.spyOn(RequestAdmissionController.prototype, 'acquireAsync').mockImplementation(async function (
        this: RequestAdmissionController,
        ...args: Parameters<RequestAdmissionController['acquireAsync']>
      ) {
        const lease: IRequestLease = await admitAsync.apply(this, args);
        if (routedRequests === 2) secondAdmitted.resolve();
        return lease;
      });
      first = runAsync(fixture, 'dependency', ['build', '--to', 'a']);
      await leaseRequested.promise;
      // The second client connects while the daemon is busy, and takes a while before its handshake.
      secondClient = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
      await secondClient.handshakeAsync();
      grantLease.resolve();
      for (let turn: number = 0; turn < 20; turn++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      second = runAsync({ ...fixture, client: secondClient }, 'consumer', ['build', '--to', 'b']);
      const results: ITerminalExchange[] = await Promise.all([first, second]);
      for (const result of results)
        expect(result.terminal).toMatchObject({
          kind: 'requestResult',
          payload: { exitCode: 0 }
        });
      expect(scheduleSpy).toHaveBeenCalledTimes(1);
    } finally {
      grantLease.resolve();
      secondAdmitted.resolve();
      await first;
      await second;
      jest.restoreAllMocks();
      await secondClient?.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });
});
