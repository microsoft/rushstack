// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonEventType, IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';

import type { IDaemonRenderer, IDaemonRendererContext } from '../DaemonRenderer';
import { DaemonRendererHost } from '../DaemonRendererHost';

import { TestTerminal } from './TestTerminal';

class RecordingRenderer implements IDaemonRenderer {
  public readonly name: string = 'recording';
  public readonly events: IDaemonEventEnvelope[] = [];
  public async initializeAsync(context: IDaemonRendererContext): Promise<void> {
    return Promise.resolve();
  }
  public report(event: IDaemonEventEnvelope): void {
    this.events.push(event);
  }
  public async flushAsync(): Promise<void> {
    return Promise.resolve();
  }
  public async closeAsync(): Promise<void> {
    return Promise.resolve();
  }
}

function makeEnvelope(
  type: DaemonEventType,
  operationId: string,
  payload?: unknown
): IDaemonEventEnvelope {
  const effectivePayload: unknown = payload ?? { operationId };
  return {
    protocolVersion: { major: 0, minor: 1 },
    eventId: `e-${type}`,
    sessionId: 's',
    sequence: 1,
    timestamp: '2026-08-13T00:00:00.000Z',
    source: { packageName: 'test', packageVersion: '0' },
    privacy: 'public',
    required: false,
    type,
    payload: effectivePayload
  };
}

function hostAt(verbosity: 'quiet' | 'verbose'): { host: DaemonRendererHost; renderer: RecordingRenderer } {
  const renderer: RecordingRenderer = new RecordingRenderer();
  return {
    host: new DaemonRendererHost({ terminal: new TestTerminal(), verbosity, renderer }),
    renderer
  };
}

it('gives two clients at different verbosities the correct subsets of one stream', () => {
  const quiet: ReturnType<typeof hostAt> = hostAt('quiet');
  const verbose: ReturnType<typeof hostAt> = hostAt('verbose');
  const stream: IDaemonEventEnvelope[] = [
    makeEnvelope('operationRegistered', 'op-a'),
    makeEnvelope('operationStatusChanged', 'op-a', { operationId: 'op-a', status: 'SUCCESS' }),
    makeEnvelope('activityChanged', 'op-a', { text: 'detail' }),
    makeEnvelope('commandResult', '', { status: 'SUCCESS' })
  ];
  for (const envelope of stream) {
    quiet.host.handleEvent(envelope);
    verbose.host.handleEvent(envelope);
  }
  const quietTypes: string[] = quiet.renderer.events.map((e: IDaemonEventEnvelope) => e.type);
  const verboseTypes: string[] = verbose.renderer.events.map((e: IDaemonEventEnvelope) => e.type);
  // Quiet shows the global activity lines legacy quiet mode prints, plus the result.
  expect(quietTypes).toEqual(['activityChanged', 'commandResult']);
  expect(verboseTypes).toHaveLength(stream.length);
  expect(quietTypes.length).toBeLessThan(verboseTypes.length);
});

it('filters stdout display per client without mutating the shared stream', () => {
  const quietTerminal: TestTerminal = new TestTerminal();
  const verboseTerminal: TestTerminal = new TestTerminal();
  const quietHost: DaemonRendererHost = new DaemonRendererHost({
    terminal: quietTerminal,
    verbosity: 'quiet'
  });
  const verboseHost: DaemonRendererHost = new DaemonRendererHost({ terminal: verboseTerminal, verbosity: 'verbose' });
  // Both clients receive the same raw stream; display filtering is per-client.
  quietHost.handleLogChunk('op-a', 'stdout', Buffer.from('hello\n'));
  verboseHost.handleLogChunk('op-a', 'stdout', Buffer.from('hello\n'));
  quietHost.handleLogChunk('op-a', 'stderr', Buffer.from('oops\n'));
  verboseHost.handleLogChunk('op-a', 'stderr', Buffer.from('oops\n'));
  const close = makeEnvelope('extension', '', {
    data: { operationId: 'op-a' }, name: 'rushd.operation-stream-closed'
  });
  quietHost.handleEvent(close);
  verboseHost.handleEvent(close);
  // Quiet matches legacy DiscardStdoutTransform: stdout hidden, stderr shown.
  expect(quietTerminal.stdout).not.toContain('hello');
  expect(quietTerminal.stderr).toContain('oops');
  expect(verboseTerminal.stdout).toContain('hello');
  expect(verboseTerminal.stderr).toContain('oops');
});
