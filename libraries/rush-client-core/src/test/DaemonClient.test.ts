// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as net from 'node:net';
import { PassThrough } from 'node:stream';
import {
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  decodeDaemonControlMessage,
  decodeDaemonStdinChunk,
  encodeDaemonControlMessage,
  encodeDaemonEventFrame,
  encodeDaemonLogChunk,
  type DaemonControlMessage,
  type IDaemonProtocolVersion,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';
import { DaemonFrameConnection } from '@rushstack/rush-daemon-transport';

import { DaemonClient } from '../DaemonClient';
import { captureDaemonRequest } from '../captureDaemonRequest';

describe('DaemonClient', () => {
  let server: net.Server;
  let connection: DaemonFrameConnection | undefined;
  let address: string;
  let controls: DaemonControlMessage[];
  let peerVersion: IDaemonProtocolVersion;
  let acknowledgeInput: boolean;
  let onRequest: (message: DaemonControlMessage) => Promise<void>;
  let onStdin: (bytes: Uint8Array) => Promise<void>;

  beforeEach(async () => {
    controls = [];
    peerVersion = DAEMON_PROTOCOL_VERSION;
    acknowledgeInput = true;
    address =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\rush-client-test-${process.pid}-${Math.random()}`
        : `/tmp/rush-client-test-${process.pid}-${Math.random()}.sock`;
    server = net.createServer((socket) => {
      connection = new DaemonFrameConnection(socket);
      connection.onFrame(async (frame) => {
        if (frame.kind === DaemonFrameType.stdin) {
          const { chunk, requestId } = decodeDaemonStdinChunk(frame.payload);
          if (peerVersion.minor >= 7 && acknowledgeInput) {
            await sendAsync({ kind: 'stdinReady', payload: { requestId } });
          }
          await onStdin(chunk);
          return;
        }
        if (frame.kind !== DaemonFrameType.controlJson) return;
        const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
        controls.push(message);
        if (message.kind === 'hello') {
          await sendAsync({
            kind: 'helloAck',
            payload: { protocolVersion: peerVersion, sessionId: 'test' }
          });
        } else if (message.kind === 'ping') {
          await sendAsync({ kind: 'pong', payload: { uptimeMs: 1, daemonVersion: 'test' } });
        } else {
          await onRequest(message);
        }
      });
    });
    onRequest = async () => {};
    onStdin = async () => {};
    await new Promise<void>((resolve) => server.listen(address, resolve));
  });

  afterEach(async () => {
    await connection?.closeAsync();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  async function sendAsync(message: DaemonControlMessage): Promise<void> {
    await connection!.sendFrameAsync({
      kind: DaemonFrameType.controlJson,
      payload: encodeDaemonControlMessage(message)
    });
  }

  function request(): IDaemonRequestEnvelope {
    return captureDaemonRequest({
      argv: ['build'],
      commandName: 'build',
      commandOrigin: 'custom',
      cwd: '/repo',
      environment: { TEST: 'one' },
      terminal: { isTTY: false, supportsColor: false }
    });
  }

  it('captures the parser discriminator without coupling core to Rush parsing', () => {
    const original = { ...request(), invocationKind: 'rushx' as const };
    const captured = captureDaemonRequest(original);
    expect(captured.invocationKind).toBe('rushx');
    expect(Object.isFrozen(captured)).toBe(true);
  });

  it.each([5, 6, 7])('does not send or consume Rushx input on protocol 0.%s', async (minor) => {
    peerVersion = { major: 0, minor };
    const input = new PassThrough();
    input.end('unconsumed');
    const client = await DaemonClient.connectAsync({ socketPath: address });
    const envelope = { ...request(), invocationKind: 'rushx' as const };
    const result = await client.executeAsync({ request: envelope, stdin: input });
    expect(result).toMatchObject({ kind: 'fallback', reason: 'unsupported' });
    expect(controls.some((message) => message.kind === 'requestStart')).toBe(false);
    expect(input.read().toString()).toBe('unconsumed');
  });

  it('subscribes, proves readiness and drains output before returning the exit code', async () => {
    const seen: string[] = [];
    onRequest = async (message) => {
      if (message.kind !== 'requestStart') return;
      await connection!.sendFrameAsync({
        kind: DaemonFrameType.logStdout,
        payload: encodeDaemonLogChunk({ operationId: 'op', chunk: Buffer.from('hello') })
      });
      await connection!.sendFrameAsync({
        kind: DaemonFrameType.event,
        payload: encodeDaemonEventFrame({
          protocolVersion: { major: 0, minor: 1 },
          eventId: 'event',
          sessionId: 'test',
          sequence: 1,
          timestamp: new Date().toISOString(),
          source: { packageName: 'test', packageVersion: '1.0.0' },
          privacy: 'public',
          required: true,
          type: 'commandStarted',
          payload: {}
        })
      });
      await connection!.sendFrameAsync({
        kind: DaemonFrameType.logStderr,
        payload: encodeDaemonLogChunk({ operationId: 'op', chunk: Buffer.from('error') })
      });
      await sendAsync({
        kind: 'requestResult',
        payload: { requestId: message.payload.requestId, exitCode: 7, outcome: 'failure', aborted: false }
      });
    };
    const client = await DaemonClient.connectAsync({ socketPath: address, expectedDaemonVersion: 'test' });
    const result = await client.executeAsync({
      request: request(),
      onStdoutAsync: async (bytes) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        seen.push(Buffer.from(bytes).toString());
      },
      onStderrAsync: async (bytes) => {
        seen.push(Buffer.from(bytes).toString());
      },
      onEventAsync: async (event) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        seen.push(event.eventId);
      }
    });
    expect(result).toMatchObject({ kind: 'result', result: { exitCode: 7 } });
    expect(seen).toEqual(['hello', 'event', 'error']);
    expect(controls.slice(0, 4).map((message) => message.kind)).toEqual([
      'hello',
      'subscribe',
      'ping',
      'requestStart'
    ]);
  });

  it.each([['install', 9], ['update', 9]])('does not send native %s to protocol 0.%s', async (command, minor) => {
    peerVersion = { major: 0, minor: Number(minor) };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    const stdin = new PassThrough();
    stdin.end('untouched');
    const envelope = { ...request(), commandName: String(command), commandOrigin: 'built-in' as const };
    expect(await client.executeAsync({ request: envelope, stdin }))
      .toMatchObject({ kind: 'fallback', reason: 'unsupported' });
    expect(controls.some((message) => message.kind === 'requestStart')).toBe(false);
    expect(stdin.read().toString()).toBe('untouched');
  });

  it.each(['output', 'event', 'stdin', 'raw-mode', 'old-peer'])(
    'does not authorize restart replay after %s',
    async (mode) => {
      if (mode === 'old-peer') peerVersion = { major: 0, minor: 9 };
      const envelope = { ...request(), terminal: { ...request().terminal, acceptsStdin: true } };
      const stdin = new PassThrough();
      onRequest = async (message) => {
        if (message.kind !== 'requestStart') return;
        if (mode === 'output') {
          await connection!.sendFrameAsync({
            kind: DaemonFrameType.logStdout,
            payload: encodeDaemonLogChunk({ operationId: envelope.requestId, chunk: Buffer.from('executed') })
          });
        } else if (mode === 'event') {
          await connection!.sendFrameAsync({
            kind: DaemonFrameType.event,
            payload: encodeDaemonEventFrame({
              protocolVersion: DAEMON_PROTOCOL_VERSION, eventId: 'event', sessionId: 'test', sequence: 1,
              timestamp: new Date().toISOString(), type: 'commandStarted', privacy: 'public', required: true,
              source: { packageName: 'test', packageVersion: '1.0.0' }, payload: {}
            })
          });
        } else if (mode === 'stdin') {
          await sendAsync({ kind: 'stdinReady', payload: { requestId: envelope.requestId } });
        } else if (mode === 'raw-mode') {
          await sendAsync({ kind: 'setRawMode', payload: { requestId: envelope.requestId, enabled: true } });
        }
        await sendAsync({
          kind: 'requestResult',
          payload: { requestId: envelope.requestId, exitCode: 1, outcome: 'failure', aborted: false, retryAfterRestart: true }
        });
      };
      const client = await DaemonClient.connectAsync({ socketPath: address });
      await expect(client.executeAsync({
        request: envelope, stdin, setRawMode: () => {}, onStdoutAsync: async () => {}, onEventAsync: async () => {}
      })).rejects.toThrow(mode === 'old-peer' ? 'Unexpected pre-execution restart' : 'not retried');
      stdin.destroy();
      expect(controls.filter((message) => message.kind === 'requestStart')).toHaveLength(1);
    }
  );

  it('does not consume stdin when a controlling terminal requires fallback', async () => {
    const stdin = new PassThrough();
    stdin.write('still here');
    onRequest = async (message) => {
      if (message.kind === 'requestStart') {
        await sendAsync({
          kind: 'terminalPolicy',
          payload: {
            requestId: message.payload.requestId,
            decision: 'requiresInProcess',
            reason: 'controllingTerminalRequired'
          }
        });
      }
    };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    const result = await client.executeAsync({ request: request(), stdin });
    expect(result).toMatchObject({ kind: 'fallback', reason: 'controllingTerminalRequired' });
    expect(stdin.read().toString()).toBe('still here');
  });

  it('cancels on abort and waits for the authoritative result', async () => {
    const abort = new AbortController();
    const envelope = request();
    onRequest = async (message) => {
      if (message.kind === 'requestStart') abort.abort();
      if (message.kind === 'requestCancel') {
        await sendAsync({
          kind: 'requestResult',
          payload: { requestId: envelope.requestId, exitCode: 130, aborted: true, outcome: 'aborted' }
        });
      }
    };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    expect(await client.executeAsync({ request: envelope, abortSignal: abort.signal })).toMatchObject({
      kind: 'result',
      result: { exitCode: 130 }
    });
    expect(controls.filter((message) => message.kind === 'requestCancel')).toHaveLength(1);
  });

  it('forwards raw stdin only after acknowledgement and restores raw mode', async () => {
    const stdin = new PassThrough();
    const rawModes: boolean[] = [];
    const envelope = { ...request(), terminal: { ...request().terminal, acceptsStdin: true } };
    onRequest = async (message) => {
      if (message.kind === 'requestStart') {
        await sendAsync({ kind: 'setRawMode', payload: { requestId: envelope.requestId, enabled: true } });
        await sendAsync({ kind: 'stdinReady', payload: { requestId: envelope.requestId } });
      }
    };
    onStdin = async (bytes) => {
      expect(Buffer.from(bytes)).toEqual(Buffer.from([0, 255, 13]));
      expect(controls.some((message) => message.kind === 'rawModeChanged' && message.payload.enabled)).toBe(
        true
      );
      await sendAsync({
        kind: 'requestResult',
        payload: { requestId: envelope.requestId, exitCode: 0, aborted: false, outcome: 'success' }
      });
    };
    stdin.write(Buffer.from([0, 255, 13]));
    const client = await DaemonClient.connectAsync({ socketPath: address });
    await client.executeAsync({ request: envelope, stdin, setRawMode: (enabled) => rawModes.push(enabled) });
    expect(rawModes).toEqual([true, false]);
    expect(stdin.listenerCount('data')).toBe(0);
  });

  it('restores raw mode and rejects instead of replaying after disconnect', async () => {
    const rawModes: boolean[] = [];
    onRequest = async (message) => {
      if (message.kind === 'requestStart') {
        await sendAsync({
          kind: 'setRawMode',
          payload: { requestId: message.payload.requestId, enabled: true }
        });
      } else if (message.kind === 'rawModeChanged') {
        await connection!.closeAsync();
      }
    };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    await expect(
      client.executeAsync({ request: request(), setRawMode: (enabled) => rawModes.push(enabled) })
    ).rejects.toThrow('not retried');
    expect(rawModes).toEqual([true, false]);
  });

  it.each(['output', 'input'])('does not replay a late unsupported rejection after %s', async (kind) => {
    onRequest = async (message) => {
      if (message.kind !== 'requestStart') return;
      if (kind === 'output') {
        await connection!.sendFrameAsync({
          kind: DaemonFrameType.logStdout,
          payload: encodeDaemonLogChunk({ operationId: message.payload.requestId, chunk: Buffer.from('ran') })
        });
      } else {
        await sendAsync({ kind: 'stdinReady', payload: { requestId: message.payload.requestId } });
      }
      await sendAsync({
        kind: 'requestRejected',
        payload: { requestId: message.payload.requestId, code: 'unsupported', message: 'Too late.' }
      });
    };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    await expect(client.executeAsync({
      request: { ...request(), terminal: { ...request().terminal, acceptsStdin: true } },
      stdin: new PassThrough(),
      onStdoutAsync: async () => {}
    })).rejects.toThrow('not retried');
  });

  it('does not replay after terminal control even when no stdin source was supplied', async () => {
    const rawModes: boolean[] = [];
    const envelope = request();
    onRequest = async (message) => {
      if (message.kind === 'requestStart') {
        await sendAsync({
          kind: 'setRawMode', payload: { requestId: envelope.requestId, enabled: true }
        });
      } else if (message.kind === 'rawModeChanged') {
        await sendAsync({
          kind: 'requestRejected',
          payload: { requestId: envelope.requestId, code: 'unsupported', message: 'Too late for fallback.' }
        });
      }
    };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    await expect(client.executeAsync({
      request: envelope, setRawMode: (enabled) => rawModes.push(enabled)
    })).rejects.toThrow('not retried');
    expect(rawModes).toEqual([true, false]);
    expect(controls.filter((message) => message.kind === 'requestStart')).toHaveLength(1);
  });

  it('returns only unsupported rejections as fallback', async () => {
    onRequest = async (message) => {
      if (message.kind === 'requestStart')
        await sendAsync({
          kind: 'requestRejected',
          payload: { requestId: message.payload.requestId, code: 'unsupported', message: 'No resolver.' }
        });

    };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    expect(await client.executeAsync({ request: request() })).toEqual({
      kind: 'fallback',
      reason: 'unsupported',
      message: 'No resolver.'
    });
  });

  it.each([5, 6])('preserves piped input when peer 0.%s cannot admit EOF', async (minor) => {
    peerVersion = { major: 0, minor };
    const stdin = new PassThrough();
    stdin.end('untouched');
    const envelope = { ...request(), terminal: { ...request().terminal, acceptsStdin: true } };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    const result = await client.executeAsync({ request: envelope, stdin, requiresStdinEnd: true });
    expect(result).toMatchObject({ kind: 'fallback', reason: 'stdinEndUnsupported' });
    expect(controls.some((message) => message.kind === 'requestStart')).toBe(false);
    expect(stdin.read().toString()).toBe('untouched');
    expect(stdin.listenerCount('data')).toBe(0);
  });

  it.each([Buffer.from([0, 3, 255, 13]), Buffer.alloc(0), Buffer.alloc(2 * 1024 * 1024, 3)]
    .map((input) => ({ input, length: input.length })))(
    'waits for admission and delivers $length piped bytes followed by EOF',
    async ({ input }) => {
      const stdin = new PassThrough();
      stdin.end(input);
      const envelope = { ...request(), terminal: { ...request().terminal, acceptsStdin: true } };
      const received: Buffer[] = [];
      onStdin = async (bytes) => { received.push(Buffer.from(bytes)); };
      onRequest = async (message) => {
        if (message.kind === 'requestStart') {
          expect(stdin.readableLength).toBe(input.length);
          expect(received).toHaveLength(0);
          await sendAsync({ kind: 'stdinReady', payload: { requestId: envelope.requestId } });
        } else if (message.kind === 'stdinEnd') {
          expect(Buffer.concat(received).equals(input)).toBe(true);
          await sendAsync({
            kind: 'requestResult',
            payload: { requestId: envelope.requestId, exitCode: 0, outcome: 'success', aborted: false }
          });
        }
      };
      const client = await DaemonClient.connectAsync({ socketPath: address });
      await expect(client.executeAsync({
        request: envelope, stdin, requiresStdinEnd: true
      })).resolves.toMatchObject({ kind: 'result', result: { exitCode: 0 } });
      expect(controls.filter((message) => message.kind === 'stdinEnd')).toHaveLength(1);
      expect(stdin.listenerCount('end')).toBe(0);
    }
  );

  it('keeps control responsive while a large stdin chunk waits for its next write credit', async () => {
    acknowledgeInput = false;
    const stdin = new PassThrough();
    const input: Buffer = Buffer.alloc(128 * 1024, 3);
    stdin.end(input);
    const envelope = { ...request(), terminal: { ...request().terminal, acceptsStdin: true } };
    const received: Buffer[] = [];
    onStdin = async (bytes) => {
      received.push(Buffer.from(bytes));
      await sendAsync(received.length === 1
        ? { kind: 'setRawMode', payload: { requestId: envelope.requestId, enabled: false } }
        : { kind: 'stdinReady', payload: { requestId: envelope.requestId } });
    };
    onRequest = async (message) => {
      if (message.kind === 'requestStart' || message.kind === 'rawModeChanged') {
        if (message.kind === 'rawModeChanged') expect(received).toHaveLength(1);
        await sendAsync({ kind: 'stdinReady', payload: { requestId: envelope.requestId } });
      } else if (message.kind === 'stdinEnd') {
        expect(Buffer.concat(received).equals(input)).toBe(true);
        await sendAsync({
          kind: 'requestResult',
          payload: { requestId: envelope.requestId, exitCode: 0, outcome: 'success', aborted: false }
        });
      }
    };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    await expect(client.executeAsync({
      request: envelope, stdin, requiresStdinEnd: true, setRawMode: () => {}
    })).resolves.toMatchObject({ kind: 'result', result: { exitCode: 0 } });
  });

  it('rejects a version mismatch without attempting a request', async () => {
    await expect(
      DaemonClient.connectAsync({ socketPath: address, expectedDaemonVersion: 'other' })
    ).rejects.toThrow('Expected daemon other');
    expect(controls.some((message) => message.kind === 'requestStart')).toBe(false);
  });

  it('keeps protocol 0.5 request peers compatible with later additive minors', async () => {
    peerVersion = { major: 0, minor: 5 };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    await client.closeAsync();
    expect(controls.some((message) => message.kind === 'ping')).toBe(true);
  });

  it('rejects peers without the request lifecycle capability', async () => {
    peerVersion = { major: 0, minor: 4 };
    await expect(DaemonClient.connectAsync({ socketPath: address })).rejects.toThrow(
      'required request lifecycle protocol'
    );
    expect(controls.some((message) => message.kind === 'subscribe')).toBe(false);
  });

  it('waits for both shutdown acknowledgement and EOF', async () => {
    let acknowledged: () => void = () => {};
    const ack: Promise<void> = new Promise((resolve) => {
      acknowledged = resolve;
    });
    onRequest = async (message) => {
      if (message.kind === 'shutdown') {
        await sendAsync({ kind: 'shutdownAck', payload: {} });
        acknowledged();
      }
    };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    expect(client.protocolVersion.minor).toBeGreaterThanOrEqual(6);
    let completed: boolean = false;
    const shutdown: Promise<void> = client.shutdownAsync().then(() => {
      completed = true;
    });
    await ack;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(completed).toBe(false);
    await connection!.closeAsync();
    await shutdown;
    expect(completed).toBe(true);
    expect(controls.filter((message) => message.kind === 'shutdown')).toHaveLength(1);
  });

  it('rejects shutdown before sending a frame to a protocol 0.5 peer', async () => {
    peerVersion = { major: 0, minor: 5 };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    await expect(client.shutdownAsync()).rejects.toThrow('protocol 0.6');
    expect(controls.some((message) => message.kind === 'shutdown')).toBe(false);
  });

  it('does not mistake an unacknowledged EOF for successful shutdown', async () => {
    onRequest = async (message) => {
      if (message.kind === 'shutdown') await connection!.closeAsync();
    };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    await expect(client.shutdownAsync()).rejects.toThrow('before acknowledging shutdown');
  });

  it('bounds the wait when an acknowledged shutdown does not close', async () => {
    onRequest = async (message) => {
      if (message.kind === 'shutdown') await sendAsync({ kind: 'shutdownAck', payload: {} });
    };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    await expect(client.shutdownAsync(40)).rejects.toThrow(
      'Timed out waiting for shutdown acknowledgement and EOF'
    );
  });

  it('does not send an already cancelled request or leak a rejected completion promise', async () => {
    const client = await DaemonClient.connectAsync({ socketPath: address });
    expect(await client.executeAsync({ request: request(), abortSignal: AbortSignal.abort() })).toMatchObject(
      {
        kind: 'result',
        result: { exitCode: 130, aborted: true }
      }
    );
    expect(controls.some((message) => message.kind === 'requestStart')).toBe(false);
  });

  it('turns raw Ctrl+C into cancellation when enabled by the CLI', async () => {
    const stdin = new PassThrough();
    const envelope = { ...request(), terminal: { ...request().terminal, acceptsStdin: true } };
    stdin.write(Buffer.from([3]));
    onRequest = async (message) => {
      if (message.kind === 'requestStart') {
        await sendAsync({ kind: 'setRawMode', payload: { requestId: envelope.requestId, enabled: true } });
        await sendAsync({ kind: 'stdinReady', payload: { requestId: envelope.requestId } });
      } else if (message.kind === 'requestCancel') {
        await sendAsync({
          kind: 'requestResult',
          payload: { requestId: envelope.requestId, exitCode: 130, aborted: true, outcome: 'aborted' }
        });
      }
    };
    const client = await DaemonClient.connectAsync({ socketPath: address });
    expect(
      await client.executeAsync({
        request: envelope,
        stdin,
        cancelOnCtrlC: true,
        setRawMode: () => {}
      })
    ).toMatchObject({ kind: 'result', result: { exitCode: 130 } });
  });
});

it('captures an immutable request snapshot without undefined environment entries', () => {
  const environment = { A: 'before', B: undefined, ['__proto__']: 'preserved' };
  const argv = ['build'];
  const terminal = { isTTY: false, supportsColor: false, columns: 80 };
  const request = captureDaemonRequest({
    argv,
    environment,
    terminal,
    cwd: '/repo',
    commandName: 'build',
    commandOrigin: 'custom'
  });
  environment.A = 'after';
  argv.push('--changed');
  terminal.columns = 120;
  expect(request.environment).toEqual({ A: 'before', ['__proto__']: 'preserved' });
  expect(request.argv).toEqual(['build']);
  expect(request.terminal.columns).toBe(80);
  expect(Object.isFrozen(request.environment)).toBe(true);
});
