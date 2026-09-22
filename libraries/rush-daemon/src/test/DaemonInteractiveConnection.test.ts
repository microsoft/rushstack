// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonControlMessage } from '@rushstack/rush-daemon-protocol';

import { DaemonInteractiveConnection } from '../DaemonInteractiveConnection';
import type { IInteractiveRequestSession } from '../InteractiveRequestInputRouter';

it('cancels an unacknowledged raw-mode entry but still acknowledges restoration', async () => {
  const sentControls: DaemonControlMessage[] = [];
  let markEnterSent: (() => void) | undefined;
  let markRestoreSent: (() => void) | undefined;
  const enterSent: Promise<void> = new Promise((resolve) => {
    markEnterSent = resolve;
  });
  const restoreSent: Promise<void> = new Promise((resolve) => {
    markRestoreSent = resolve;
  });
  const holder: { connection?: DaemonInteractiveConnection } = {};
  const connection: DaemonInteractiveConnection = new DaemonInteractiveConnection(
    (message: DaemonControlMessage): Promise<void> => {
      sentControls.push(message);
      if (message.kind === 'setRawMode') {
        if (message.payload.enabled) {
          markEnterSent?.();
        } else {
          markRestoreSent?.();
        }
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
  await enterSent;
  requestAbortController.abort(new Error('request cancelled'));

  await expect(enterRawModePromise).rejects.toThrow('request cancelled');
  const finishPromise: Promise<void> = session.finishAsync();
  await restoreSent;
  expect(() =>
    connection.handleControlMessage({
      kind: 'rawModeChanged',
      payload: { enabled: true, requestId: 'raw-abort' }
    })
  ).not.toThrow();
  connection.handleControlMessage({
    kind: 'rawModeChanged',
    payload: { enabled: false, requestId: 'raw-abort' }
  });
  await expect(finishPromise).rejects.toThrow('request cancelled');
  expect(
    sentControls
      .filter((message): message is Extract<DaemonControlMessage, { kind: 'setRawMode' }> =>
        message.kind === 'setRawMode'
      )
      .map(({ payload }) => payload.enabled)
  ).toEqual([true, false]);
});

it('rejects interactive traffic until the client negotiates support', async () => {
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
  const stdinPromise: Promise<void> = connection.routeStdinFrameAsync(Uint8Array.of(0));
  expect(stdinPromise).toBeInstanceOf(Promise);
  await expect(stdinPromise).rejects.toThrow('did not negotiate');
  expect(() => connection.writeTerminalPolicyAsync({
    decision: 'runInDaemon',
    requestId: 'not-negotiated'
  })).toThrow('did not negotiate');
});

it('serializes concurrent raw-mode requests and preserves exclusive ownership', async () => {
  const sentControls: DaemonControlMessage[] = [];
  const failures: Error[] = [];
  const holder: { connection?: DaemonInteractiveConnection } = {};
  const connection: DaemonInteractiveConnection = new DaemonInteractiveConnection(
    (message: DaemonControlMessage): Promise<void> => {
      sentControls.push(message);
      if (message.kind === 'setRawMode') {
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
  const first: IInteractiveRequestSession = connection.registerRequest({
    abortSignal: new AbortController().signal,
    acceptsStdin: true,
    onFailure: () => undefined,
    requestId: 'first-owner'
  });
  const second: IInteractiveRequestSession = connection.registerRequest({
    abortSignal: new AbortController().signal,
    acceptsStdin: true,
    onFailure: (error: Error) => failures.push(error),
    requestId: 'second-owner'
  });

  const firstRawMode: Promise<void> = first.setRawModeAsync(true);
  const secondRawMode: Promise<void> = second.setRawModeAsync(true);
  await firstRawMode;
  await expect(secondRawMode).rejects.toThrow('already owned');
  await expect(second.finishAsync()).rejects.toThrow('already owned');
  expect(failures).toHaveLength(1);
  expect(rawModePayloads(sentControls)).toEqual([{ enabled: true, requestId: 'first-owner' }]);

  await first.finishAsync();
  expect(rawModePayloads(sentControls)).toEqual([
    { enabled: true, requestId: 'first-owner' },
    { enabled: false, requestId: 'first-owner' }
  ]);
});

function rawModePayloads(
  messages: DaemonControlMessage[]
): Array<{ enabled: boolean; requestId: string }> {
  return messages
    .filter((message): message is Extract<DaemonControlMessage, { kind: 'setRawMode' }> =>
      message.kind === 'setRawMode'
    )
    .map(({ payload }) => payload);
}
