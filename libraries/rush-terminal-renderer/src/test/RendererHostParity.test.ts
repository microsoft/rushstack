// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalChunkKind } from '@rushstack/terminal';

import { DaemonRendererHost } from '../DaemonRendererHost';

import { LegacyPipelineReplica } from './LegacyPipelineReplica';
import { CollectingWritable, TestTerminal } from './TestTerminal';

const TOTAL_OPERATIONS: number = 2;

interface IFixture {
  readonly host: DaemonRendererHost;
  readonly replica: LegacyPipelineReplica;
  readonly hostTerminal: TestTerminal;
  readonly legacySink: CollectingWritable;
}

function createFixture(quiet: boolean): IFixture {
  const hostTerminal: TestTerminal = new TestTerminal();
  const legacySink: CollectingWritable = new CollectingWritable();
  return {
    host: new DaemonRendererHost({
      terminal: hostTerminal,
      verbosity: quiet ? 'quiet' : 'normal'
    }),
    replica: new LegacyPipelineReplica(legacySink, TOTAL_OPERATIONS, quiet),
    hostTerminal,
    legacySink
  };
}

const minimalEnvelope = {
  protocolVersion: { major: 0, minor: 1 },
  eventId: 'e',
  sessionId: 's',
  sequence: 1,
  timestamp: '2026-08-13T00:00:00.000Z',
  source: { packageName: 'test', packageVersion: '0' },
  privacy: 'public',
  required: false
} as const;

function driveOperations(fixture: IFixture): void {
  for (const operationId of ['op-a', 'op-b']) {
    fixture.host.handleEvent({
      ...minimalEnvelope,
      type: 'operationRegistered',
      payload: { operationId }
    });
  }
  fixture.host.handleLogChunk('op-a', 'stdout', Buffer.from('a1\n'));
  fixture.replica.writeChunk('op-a', { kind: TerminalChunkKind.Stdout, text: 'a1\n' });
  fixture.host.handleLogChunk('op-b', 'stderr', Buffer.from('b1\n'));
  fixture.replica.writeChunk('op-b', { kind: TerminalChunkKind.Stderr, text: 'b1\n' });
  for (const operationId of ['op-a', 'op-b']) {
    fixture.host.handleEvent({
      ...minimalEnvelope,
      type: 'operationStatusChanged',
      payload: { operationId, status: 'SUCCESS' }
    });
    fixture.host.handleEvent({
      ...minimalEnvelope,
      type: 'extension',
      payload: { name: 'rushd.operation-stream-closed', data: { operationId } }
    });
    fixture.replica.closeOperation(operationId);
  }
}

it('matches the legacy in-process output byte-for-byte for the same run', async () => {
  const fixture: IFixture = createFixture(false);
  await fixture.host.initializeAsync();
  driveOperations(fixture);
  expect(fixture.hostTerminal.stdout).toBe(fixture.legacySink.stdout);
  expect(fixture.hostTerminal.stderr).toBe(fixture.legacySink.stderr);
  expect(fixture.hostTerminal.stdout).toContain('==[');
  expect(fixture.hostTerminal.stdout).toContain('op-a');
});

it('suppresses the header blank line in quiet mode, exactly like legacy', async () => {
  const fixture: IFixture = createFixture(true);
  await fixture.host.initializeAsync();
  driveOperations(fixture);
  expect(fixture.hostTerminal.stdout).toBe(fixture.legacySink.stdout);
});
