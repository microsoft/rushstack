// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { OperationStatus } from '@microsoft/rush-lib';
import { encodeDaemonStdinChunk } from '@rushstack/rush-daemon-protocol';
import type { IDaemonPhasedRequest } from '@rushstack/rush-daemon-protocol';

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
const REQUEST_ID: string = 'phased-input';
const INPUT_BYTE: number = 0x7f;

function createRequest(overrides: Partial<IDaemonPhasedRequest> = {}): IDaemonPhasedRequest {
  return {
    commandName: 'build',
    engineShape: TEST_ENGINE_SHAPE,
    environment: {},
    operationSelection: [{ enabledState: true, operationId: OPERATION_ID }],
    requestId: REQUEST_ID,
    ...overrides
  };
}

it('bridges request-scoped stdin into phased execution', async () => {
  const inputRouter: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
  const received: Uint8Array[] = [];
  const runner: TestOperationRunner = new TestOperationRunner(
    OPERATION_ID,
    OperationStatus.Success,
    async (): Promise<void> => {
      await inputRouter.routeStdinFrameAsync(
        encodeDaemonStdinChunk({ chunk: Uint8Array.of(INPUT_BYTE), requestId: REQUEST_ID })
      );
    }
  );
  const fixture: ITestRoutingFixture = createRoutingFixture(new Map([[OPERATION_ID, runner]]));
  const client: TestPhasedRequestClient = new TestPhasedRequestClient();
  client.interactiveSession = inputRouter.register({
    acceptsStdin: true,
    client: {
      abortSignal: client.abortSignal,
      writeRawModeControlAsync: (): Promise<void> => Promise.resolve()
    },
    onFailure: (error: Error) => client.abortController.abort(error),
    requestId: REQUEST_ID
  });
  client.interactiveInputSink = {
    writeInputAsync: (chunk: Uint8Array): Promise<void> => {
      received.push(chunk);
      return Promise.resolve();
    }
  };

  await new PhasedRequestRouter(fixture.session).executeAsync(
    createRequest({ acceptsStdin: true, terminalRequirement: 'interactiveInput' }),
    client
  );

  expect(received).toEqual([Uint8Array.of(INPUT_BYTE)]);
});

it('rejects interactive input requirements without stdin capability', async () => {
  const fixture: ITestRoutingFixture = createRoutingFixture(
    new Map([[OPERATION_ID, new TestOperationRunner(OPERATION_ID)]])
  );
  await expect(
    new PhasedRequestRouter(fixture.session).executeAsync(
      createRequest({ terminalRequirement: 'interactiveInput' }),
      new TestPhasedRequestClient()
    )
  ).rejects.toThrow('requires acceptsStdin');
});
