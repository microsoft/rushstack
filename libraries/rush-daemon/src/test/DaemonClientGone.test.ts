// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  createDaemonHello,
  decodeDaemonControlMessage,
  encodeDaemonControlMessage,
  encodeDaemonFrame
} from '@rushstack/rush-daemon-protocol';
import type { DaemonControlMessage, IDaemonFrame } from '@rushstack/rush-daemon-protocol';
import { DaemonTransportError, DaemonTransportErrorCode } from '@rushstack/rush-daemon-transport';
import type { DaemonFrameConnection } from '@rushstack/rush-daemon-transport';

import { DaemonControlSession } from '../DaemonControlSession';
import { DaemonRequestDispatchError } from '../DaemonRequestDispatcher';
import type { DaemonRequestDispatcher } from '../DaemonRequestDispatcher';
import { RushDaemonHost } from '../RushDaemonHost';
import { createWireEnvelope } from './DaemonRequestWireTestUtilities';
import { TestWorkspaceSession } from './TestWorkspaceSession';

const DAEMON_VERSION: string = '0.1.0-test';
const WENT_AWAY: string = 'rushd: a client went away before its reply; dropped';
const LOG_WAIT_MS: number = 2000;
const LOG_POLL_MS: number = 10;

const posixDescribe: jest.Describe = process.platform === 'win32' ? describe.skip : describe;

function createSocketError(code: string, message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}

function createClosedConnectionError(): DaemonTransportError {
  return new DaemonTransportError(
    DaemonTransportErrorCode.transportClosed,
    'Cannot send a frame on a closed connection.'
  );
}

/** Lets every pending promise callback and `process.nextTick` callback run. */
function flushAsync(): Promise<void> {
  return new Promise((resolve: () => void) => setImmediate(resolve));
}

/**
 * Stands in for a socket connection. A send that fails first closes the connection with its error and then
 * rejects, in the order that a socket reports a failed write.
 */
class FakeConnection {
  public readonly sentKinds: string[] = [];
  public failSendsWith: Error | undefined;
  #frameHandler: ((frame: IDaemonFrame) => void | Promise<void>) | undefined;
  #closedHandler: ((error: Error | undefined) => void) | undefined;
  #closed: boolean = false;

  public onFrame(handler: (frame: IDaemonFrame) => void | Promise<void>): void {
    this.#frameHandler = handler;
  }

  public onClosed(handler: (error: Error | undefined) => void): void {
    this.#closedHandler = handler;
  }

  public async sendFrameAsync(frame: IDaemonFrame): Promise<void> {
    if (this.#closed) throw createClosedConnectionError();
    if (this.failSendsWith) {
      this.closeFromPeer(this.failSendsWith);
      throw this.failSendsWith;
    }
    this.sentKinds.push(decodeDaemonControlMessage(frame.payload).kind);
  }

  public async closeAsync(): Promise<void> {
    process.nextTick(() => this.closeFromPeer(undefined));
  }

  public abort(error: Error): void {
    process.nextTick(() => this.closeFromPeer(error));
  }

  public async receiveAsync(message: DaemonControlMessage): Promise<void> {
    await this.#frameHandler!({
      kind: DaemonFrameType.controlJson,
      payload: encodeDaemonControlMessage(message)
    });
  }

  public closeFromPeer(error: Error | undefined): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#closedHandler?.(error);
  }
}

interface ITestSession {
  readonly connection: FakeConnection;
  readonly session: DaemonControlSession;
  readonly errors: Error[];
  readonly logs: string[];
  readonly closeErrors: (Error | undefined)[];
  readonly shutdownRequests: string[];
}

function createTestSession(dispatcher: Partial<DaemonRequestDispatcher> = {}): ITestSession {
  const connection: FakeConnection = new FakeConnection();
  const errors: Error[] = [];
  const logs: string[] = [];
  const closeErrors: (Error | undefined)[] = [];
  const shutdownRequests: string[] = [];
  const session: DaemonControlSession = new DaemonControlSession(
    connection as unknown as DaemonFrameConnection,
    {
      daemonVersion: DAEMON_VERSION,
      dispatcher: dispatcher as DaemonRequestDispatcher,
      startedAtMs: Date.now(),
      onClosed: (closedSession: DaemonControlSession, error: Error | undefined) => closeErrors.push(error),
      onError: (error: Error) => errors.push(error),
      onLog: (message: string) => logs.push(message),
      onShutdownRequested: () => shutdownRequests.push('shutdown')
    }
  );
  return { connection, session, errors, logs, closeErrors, shutdownRequests };
}

async function handshakeAsync(connection: FakeConnection): Promise<void> {
  await connection.receiveAsync(createDaemonHello(DAEMON_PROTOCOL_VERSION));
  await connection.receiveAsync({
    kind: 'subscribe',
    payload: { isTTY: false, supportsRequestLifecycle: true }
  });
}

describe('DaemonControlSession with a client that went away', () => {
  it('logs one line, and reports no error, for a reply whose send fails with EPIPE', async () => {
    const { connection, session, errors, logs, closeErrors } = createTestSession();
    connection.failSendsWith = createSocketError('EPIPE', 'write EPIPE');
    await connection.receiveAsync(createDaemonHello(DAEMON_PROTOCOL_VERSION));
    await flushAsync();
    await session.closeAsync();
    expect({ errors, logs, closeErrors }).toEqual({
      errors: [],
      logs: [`${WENT_AWAY} the helloAck (write EPIPE)`],
      closeErrors: [undefined]
    });
  });

  it('treats ECONNRESET the same as EPIPE', async () => {
    const { connection, session, errors, logs, closeErrors } = createTestSession();
    await handshakeAsync(connection);
    connection.failSendsWith = createSocketError('ECONNRESET', 'write ECONNRESET');
    await connection.receiveAsync({ kind: 'ping', payload: {} });
    await flushAsync();
    await session.closeAsync();
    expect(connection.sentKinds).toEqual(['helloAck']);
    expect({ errors, logs, closeErrors }).toEqual({
      errors: [],
      logs: [`${WENT_AWAY} the pong (write ECONNRESET)`],
      closeErrors: [undefined]
    });
  });

  it('logs one line for each later reply that finds the connection closed', async () => {
    const { connection, session, errors, logs } = createTestSession();
    await handshakeAsync(connection);
    connection.failSendsWith = createSocketError('EPIPE', 'write EPIPE');
    // Both pings are handled before the first pong fails, as when a client sends them and leaves.
    await Promise.all([
      connection.receiveAsync({ kind: 'ping', payload: {} }),
      connection.receiveAsync({ kind: 'ping', payload: {} })
    ]);
    await flushAsync();
    await session.closeAsync();
    expect({ errors, logs }).toEqual({
      errors: [],
      logs: [
        `${WENT_AWAY} the pong (write EPIPE)`,
        `${WENT_AWAY} the pong (Cannot send a frame on a closed connection.)`
      ]
    });
  });

  it('logs one line for a lost shutdown acknowledgement and still requests the shutdown', async () => {
    const { connection, session, errors, logs, shutdownRequests } = createTestSession();
    await handshakeAsync(connection);
    connection.failSendsWith = createSocketError('EPIPE', 'write EPIPE');
    await connection.receiveAsync({ kind: 'shutdown', payload: {} });
    await flushAsync();
    await session.closeAsync();
    expect({ errors, logs, shutdownRequests }).toEqual({
      errors: [],
      logs: [`${WENT_AWAY} the shutdownAck (write EPIPE)`],
      shutdownRequests: ['shutdown']
    });
  });

  it('logs one line for a lost request outcome', async () => {
    const { connection, session, errors, logs, closeErrors } = createTestSession({
      dispatchAsync: async () => {
        throw new DaemonRequestDispatchError('unsupported', 'No route for "build".');
      }
    });
    await handshakeAsync(connection);
    connection.failSendsWith = createSocketError('EPIPE', 'write EPIPE');
    await connection.receiveAsync({
      kind: 'requestStart',
      payload: createWireEnvelope('request-1', 'build', os.tmpdir())
    });
    await flushAsync();
    await session.closeAsync();
    expect({ errors, logs, closeErrors }).toEqual({
      errors: [],
      logs: [
        'rushd: rejected request request-1 (unsupported): No route for "build".',
        `${WENT_AWAY} the result of "build" (write EPIPE)`
      ],
      closeErrors: [undefined]
    });
  });

  it('reports nothing when a client resets a connection that has no reply pending', async () => {
    const { connection, session, errors, logs, closeErrors } = createTestSession();
    await handshakeAsync(connection);
    connection.closeFromPeer(createSocketError('ECONNRESET', 'read ECONNRESET'));
    await flushAsync();
    await session.closeAsync();
    expect({ errors, logs, closeErrors }).toEqual({ errors: [], logs: [], closeErrors: [undefined] });
  });

  it.each([
    ['another socket error', createSocketError('EIO', 'write EIO')],
    ['a closed connection that no client-gone error closed', createClosedConnectionError()]
  ])('still reports %s as an error', async (description: string, failure: Error) => {
    const { connection, session, errors, logs, closeErrors } = createTestSession();
    connection.failSendsWith = failure;
    await connection.receiveAsync(createDaemonHello(DAEMON_PROTOCOL_VERSION));
    await flushAsync();
    await session.closeAsync();
    expect(logs).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(failure);
    expect(closeErrors).toHaveLength(1);
    expect(closeErrors[0]).toBe(failure);
  });
});

// Only the POSIX socket error codes were observed; a Windows named pipe may report a closed client differently.
posixDescribe('RushDaemonHost with a client socket that closes before its reply', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-daemon-client-gone-test-'));
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { force: true, recursive: true });
  });

  it('logs one line, and reports no error, for the lost hello acknowledgement', async () => {
    const errors: Error[] = [];
    const logs: string[] = [];
    const host: RushDaemonHost = await RushDaemonHost.startAsync({
      daemonVersion: DAEMON_VERSION,
      repoRoot,
      rushVersion: '5.178.1',
      createWorkspaceSessionAsync: () => Promise.resolve(new TestWorkspaceSession(repoRoot)),
      onError: (error: Error) => errors.push(error),
      onLog: (message: string) => logs.push(message)
    });
    try {
      const socket: net.Socket = await new Promise(
        (resolve: (socket: net.Socket) => void, reject: (error: Error) => void) => {
          const connecting: net.Socket = net.createConnection(host.paths.socketPath, () =>
            resolve(connecting)
          );
          connecting.once('error', reject);
        }
      );
      const socketClosed: Promise<void> = new Promise((resolve: () => void) => socket.once('close', resolve));
      socket.write(
        encodeDaemonFrame({
          kind: DaemonFrameType.controlJson,
          payload: encodeDaemonControlMessage(createDaemonHello(DAEMON_PROTOCOL_VERSION))
        })
      );
      socket.destroy();
      await socketClosed;
      const deadlineMs: number = Date.now() + LOG_WAIT_MS;
      while (!logs.some((message: string) => message.startsWith(WENT_AWAY)) && Date.now() < deadlineMs) {
        await new Promise<void>((resolve: () => void) => setTimeout(resolve, LOG_POLL_MS));
      }
    } finally {
      await host.closeAsync();
    }
    expect({
      errors,
      logs: logs.filter((message: string) => message.startsWith(WENT_AWAY))
    }).toEqual({
      errors: [],
      logs: [`${WENT_AWAY} the helloAck (write EPIPE)`]
    });
  });
});
