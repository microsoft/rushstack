// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  createDaemonHello,
  decodeDaemonControlMessage,
  encodeDaemonControlMessage,
  negotiateDaemonHello
} from '@rushstack/rush-daemon-protocol';
import type { IDaemonFrame ,
  createDaemonHelloAck} from '@rushstack/rush-daemon-protocol';

import type { DaemonFrameConnection } from '../DaemonFrameConnection';
import type { IDaemonPaths } from '../DaemonPaths';

import { createDeferred, createTestDaemonPaths, startTestDaemonPair } from './TestDaemonFixture';
import type { IDeferred, ITestDaemonPair } from './TestDaemonFixture';

const NEWER_MAJOR: number = 1;

function helloFrame(major: number): IDaemonFrame {
  return {
    kind: DaemonFrameType.controlJson,
    payload: encodeDaemonControlMessage(
      createDaemonHello({ major, minor: DAEMON_PROTOCOL_VERSION.minor })
    )
  };
}

function replyToHello(server: DaemonFrameConnection, frame: IDaemonFrame): void {
  const hello: ReturnType<typeof decodeDaemonControlMessage> = decodeDaemonControlMessage(
    frame.payload
  );
  if (hello.kind !== 'hello') {
    return;
  }
  const outcome: ReturnType<typeof negotiateDaemonHello> = negotiateDaemonHello(
    hello,
    DAEMON_PROTOCOL_VERSION,
    'session-e2e'
  );
  const reply: ReturnType<typeof createDaemonHelloAck> | ReturnType<typeof decodeDaemonControlMessage> =
    outcome.accepted
      ? outcome.ack
      : {
          kind: 'error' as const,
          payload: { code: outcome.error.code, message: outcome.error.message }
        };
  void server
    .sendFrameAsync({ kind: DaemonFrameType.controlJson, payload: encodeDaemonControlMessage(reply) })
    .then(() => server.closeAsync());
}

async function runHandshakeAsync(major: number): Promise<Record<string, unknown>> {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const answered: IDeferred<Record<string, unknown>> = createDeferred<Record<string, unknown>>();
  const pair: ITestDaemonPair = await startTestDaemonPair(paths);
  try {
    const server: DaemonFrameConnection = await pair.serverSide;
    server.onFrame((frame: IDaemonFrame) => replyToHello(server, frame));
    pair.client.onFrame((frame: IDaemonFrame) => {
      answered.resolve(
        decodeDaemonControlMessage(frame.payload) as unknown as Record<string, unknown>
      );
    });
    await pair.client.sendFrameAsync(helloFrame(major));
    return await answered.promise;
  } finally {
    await pair.client.closeAsync();
    await pair.listener.closeAsync();
  }
}

it('negotiates a matching version over a real socket', async () => {
  const reply: Record<string, unknown> = await runHandshakeAsync(DAEMON_PROTOCOL_VERSION.major);
  const payload: Record<string, unknown> = reply.payload as Record<string, unknown>;
  expect(reply.kind).toBe('helloAck');
  expect(payload.sessionId).toBe('session-e2e');
});

it('returns a typed error frame for a mismatched major version', async () => {
  const reply: Record<string, unknown> = await runHandshakeAsync(
    DAEMON_PROTOCOL_VERSION.major + NEWER_MAJOR
  );
  const payload: Record<string, unknown> = reply.payload as Record<string, unknown>;
  expect(reply.kind).toBe('error');
  expect(payload.code).toBe('protocolVersionMismatch');
});
