// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonControlMessage } from '@rushstack/rush-daemon-protocol';

import { DaemonWireRequestClient } from '../DaemonWireRequestClient';
import type { IInteractiveRequestSession } from '../InteractiveRequestInputRouter';
import { createDeferred } from './DaemonRequestWireTestUtilities';
import type { IDeferred } from './DaemonRequestWireTestUtilities';

const REQUEST_ID: string = 'request';

function createClient(
  supportsRequestStarted: boolean,
  sendControlWrittenAsync: (message: DaemonControlMessage) => Promise<void>
): DaemonWireRequestClient {
  const interactiveSession: IInteractiveRequestSession = {
    requestId: REQUEST_ID,
    attachInputSink: () => ({ [Symbol.dispose]: () => undefined }),
    finishAsync: () => Promise.resolve(),
    setRawModeAsync: () => Promise.resolve()
  };
  return new DaemonWireRequestClient({
    abortSignal: new AbortController().signal,
    getNextEventSequence: () => 0,
    interactiveSession,
    receivedTimeMs: 0,
    requestId: REQUEST_ID,
    sendControlAsync: () => Promise.resolve(),
    sendControlWrittenAsync,
    sendFrameAsync: () => Promise.resolve(),
    sessionId: 'session',
    supportsRequestAdmission: true,
    supportsRequestStarted
  });
}

describe(DaemonWireRequestClient.name, () => {
  it.each([true, false])(
    'counts a request as started before its requestStarted is written (supportsRequestStarted %s)',
    async (supportsRequestStarted: boolean) => {
      const written: IDeferred<void> = createDeferred<void>();
      const sent: DaemonControlMessage[] = [];
      const client: DaemonWireRequestClient = createClient(
        supportsRequestStarted,
        (message: DaemonControlMessage) => {
          sent.push(message);
          return written.promise;
        }
      );
      expect(client.requestStarted).toBe(false);
      const writePromise: Promise<void> = client.writeRequestStartedAsync();
      // A shutdown during the write must not tell a client that may receive requestStarted that it did not start.
      expect(client.requestStarted).toBe(true);
      written.resolve();
      await writePromise;
      expect(client.requestStarted).toBe(true);
      expect(sent).toEqual(
        supportsRequestStarted ? [{ kind: 'requestStarted', payload: { requestId: REQUEST_ID } }] : []
      );
    }
  );
});
