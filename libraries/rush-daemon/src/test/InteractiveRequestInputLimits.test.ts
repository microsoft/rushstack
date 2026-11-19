// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { encodeDaemonStdinChunk } from '@rushstack/rush-daemon-protocol';

import { InteractiveRequestInputRouter } from '../InteractiveRequestInputRouter';
import type { IInteractiveRequestSession } from '../InteractiveRequestInputRouter';

const PENDING_FRAME_LIMIT: number = 256;
const REQUEST_ID: string = 'bounded-input';

it('bounds pending stdin without turning overflow into a connection failure', async () => {
  const abortController: AbortController = new AbortController();
  const failures: Error[] = [];
  const router: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
  const session: IInteractiveRequestSession = router.register({
    acceptsStdin: true,
    client: {
      abortSignal: abortController.signal,
      writeRawModeControlAsync: (): Promise<void> => Promise.resolve()
    },
    onFailure: (error: Error) => failures.push(error),
    requestId: REQUEST_ID
  });
  const pendingRoutes: Promise<void>[] = Array.from({ length: PENDING_FRAME_LIMIT }, () =>
    routeAsync(router).catch(() => undefined)
  );

  await expect(routeAsync(router)).rejects.toThrow('pending stdin buffer limit');
  await Promise.all(pendingRoutes);
  await expect(session.finishAsync()).rejects.toThrow('pending stdin buffer limit');
  expect(failures).toHaveLength(1);
});

function routeAsync(router: InteractiveRequestInputRouter): Promise<void> {
  return router.routeStdinFrameAsync(
    encodeDaemonStdinChunk({ chunk: new Uint8Array(), requestId: REQUEST_ID })
  );
}
