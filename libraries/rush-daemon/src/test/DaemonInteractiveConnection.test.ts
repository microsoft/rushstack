// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonControlMessage } from '@rushstack/rush-daemon-protocol';

import { DaemonInteractiveConnection } from '../DaemonInteractiveConnection';
import type { IInteractiveRequestSession } from '../InteractiveRequestInputRouter';

it('cancels an unacknowledged raw-mode entry but still acknowledges restoration', async () => {
  const sentControls: DaemonControlMessage[] = [];
  const holder: { connection?: DaemonInteractiveConnection } = {};
  const connection: DaemonInteractiveConnection = new DaemonInteractiveConnection(
    (message: DaemonControlMessage): Promise<void> => {
      sentControls.push(message);
      if (message.kind === 'setRawMode' && !message.payload.enabled) {
        queueMicrotask(() =>
          holder.connection?.handleControlMessage({
            kind: 'rawModeChanged',
            payload: message.payload
          })
        );
      }
      return Promise.resolve();
    }
  );
  holder.connection = connection;
  connection.setEnabled(true);
  const requestAbortController: AbortController = new AbortController();
  const session: IInteractiveRequestSession = connection.registerRequest({
    abortSignal: requestAbortController.signal,
    acceptsStdin: true,
    onFailure: () => undefined,
    requestId: 'raw-abort'
  });

  const enterRawModePromise: Promise<void> = session.setRawModeAsync(true);
  await Promise.resolve();
  requestAbortController.abort(new Error('request cancelled'));

  await expect(enterRawModePromise).rejects.toThrow('request cancelled');
  await expect(session.finishAsync()).rejects.toThrow('request cancelled');
  expect(
    sentControls
      .filter((message): message is Extract<DaemonControlMessage, { kind: 'setRawMode' }> =>
        message.kind === 'setRawMode'
      )
      .map(({ payload }) => payload.enabled)
  ).toEqual([true, false]);
});

it('rejects interactive traffic until the client negotiates support', () => {
  const connection: DaemonInteractiveConnection = new DaemonInteractiveConnection(() =>
    Promise.resolve()
  );
  expect(() =>
    connection.registerRequest({
      abortSignal: new AbortController().signal,
      acceptsStdin: true,
      onFailure: () => undefined,
      requestId: 'not-negotiated'
    })
  ).toThrow('did not negotiate');
  expect(() => connection.writeTerminalPolicyAsync({
    decision: 'runInDaemon',
    requestId: 'not-negotiated'
  })).toThrow('did not negotiate');
});
