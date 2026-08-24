// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IDaemonPhasedRequest,
  IDaemonSetRawModeMessage
} from '@rushstack/rush-daemon-protocol';

import { DaemonRequiresInProcessError } from '../DaemonTerminalPolicy';
import { InteractiveRequestInputRouter } from '../InteractiveRequestInputRouter';
import { PhasedRequestRouter } from '../PhasedRequestRouter';
import {
  TEST_ENGINE_SHAPE,
  TestOperationRunner,
  TestPhasedRequestClient,
  createRoutingFixture
} from './PhasedRequestRouterTestUtilities';
import type { ITestRoutingFixture } from './PhasedRequestRouterTestUtilities';

const OPERATION_ID: string = 'project-a (_phase:test)';

function createRequest(overrides: Partial<IDaemonPhasedRequest> = {}): IDaemonPhasedRequest {
  return {
    commandName: 'build',
    commandOrigin: 'built-in',
    engineShape: TEST_ENGINE_SHAPE,
    environment: {},
    operationSelection: [{ enabledState: true, operationId: OPERATION_ID }],
    requestId: 'interactive-request',
    ...overrides
  };
}

function createFixture(): ITestRoutingFixture {
  return createRoutingFixture(new Map([[OPERATION_ID, new TestOperationRunner(OPERATION_ID)]]));
}

it('restores phased-request raw mode before publishing the command result', async () => {
  const fixture: ITestRoutingFixture = createFixture();
  const client: TestPhasedRequestClient = new TestPhasedRequestClient();
  const lifecycleOrder: string[] = [];
  client.interactiveSession = new InteractiveRequestInputRouter().register({
    acceptsStdin: true,
    client: {
      abortSignal: client.abortSignal,
      writeRawModeControlAsync: (message: IDaemonSetRawModeMessage): Promise<void> => {
        lifecycleOrder.push(`raw:${message.payload.enabled}`);
        return Promise.resolve();
      }
    },
    onFailure: (error: Error) => client.abortController.abort(error),
    requestId: 'interactive-request'
  });
  client.onWriteAsync = (write): Promise<void> => {
    if (write.result) lifecycleOrder.push('result');
    return Promise.resolve();
  };
  await client.interactiveSession.setRawModeAsync(true);

  await new PhasedRequestRouter(fixture.session).executeAsync(
    createRequest({ acceptsStdin: true, terminalRequirement: 'interactiveInput' }),
    client
  );

  expect(lifecycleOrder).toEqual(['raw:true', 'raw:false', 'result']);
});

it('signals requiresInProcess without scheduling a PTY-only phased request', async () => {
  const fixture: ITestRoutingFixture = createFixture();
  const client: TestPhasedRequestClient = new TestPhasedRequestClient();
  const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');

  await expect(
    new PhasedRequestRouter(fixture.session).executeAsync(
      createRequest({ terminalRequirement: 'controllingTerminal' }),
      client
    )
  ).rejects.toBeInstanceOf(DaemonRequiresInProcessError);

  expect(client.policies).toEqual([
    {
      decision: 'requiresInProcess',
      reason: 'controllingTerminalRequired',
      requestId: 'interactive-request'
    }
  ]);
  expect(scheduleSpy).not.toHaveBeenCalled();
  expect(client.writes).toHaveLength(0);
});
