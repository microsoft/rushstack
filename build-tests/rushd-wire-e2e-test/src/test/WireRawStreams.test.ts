// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@microsoft/rush-lib/lib/logic/operations/OperationStateFile');

jest.mock('@microsoft/rush-lib/lib/utilities/Utilities', () => {
  const actual = jest.requireActual('@microsoft/rush-lib/lib/utilities/Utilities');
  let now: number = 0;
  const STEP_MS: number = 100;
  return {
    ...actual,
    Utilities: { ...actual.Utilities, getTimeInMs: () => (now += STEP_MS) }
  };
});

jest.mock('@rushstack/terminal', () => {
  const actual = jest.requireActual('@rushstack/terminal');
  return {
    ...actual,
    ConsoleTerminalProvider: { ...actual.ConsoleTerminalProvider, supportsColor: false }
  };
});

import { DaemonFrameType, decodeDaemonEventFrame } from '@rushstack/rush-daemon-protocol';
import type { IDaemonEventEnvelope, IDaemonFrame } from '@rushstack/rush-daemon-protocol';

import { runEngineScenarioAsync } from './EngineScenario';
import type { IEngineScenarioResult } from './EngineScenario';
import { collectLogChunk } from './FrameDispatch';
import { replayFramesOverSocketAsync } from './WireDriver';

interface ICapturedStream {
  readonly events: IDaemonEventEnvelope[];
  readonly perOperation: Map<string, string[]>;
}

function captureFrame(captured: ICapturedStream, frame: IDaemonFrame): void {
  collectLogChunk(captured.perOperation, frame);
  if (frame.type === DaemonFrameType.event) {
    captured.events.push(decodeDaemonEventFrame(frame.payload));
  }
}

function isActivityFor(envelope: IDaemonEventEnvelope, operationId: string): boolean {
  if (envelope.type !== 'activityChanged') {
    return false;
  }
  const scope: IDaemonEventEnvelope['scope'] = envelope.scope;
  return scope !== undefined && scope.operationId === operationId;
}

function rawStreamText(captured: ICapturedStream, operationId: string): string {
  const chunks: string[] | undefined = captured.perOperation.get(operationId);
  return chunks === undefined ? '' : chunks.join('');
}

function payloadJson(envelope: IDaemonEventEnvelope | undefined): string {
  return JSON.stringify(envelope === undefined ? undefined : envelope.payload);
}

it('delivers each operation\'s raw streams intact over the socket (unicode round-trip)', async () => {
  const result: IEngineScenarioResult = await runEngineScenarioAsync({ quiet: false });
  const captured: ICapturedStream = { events: [], perOperation: new Map() };
  await replayFramesOverSocketAsync(result.adapter.frames, (frame: IDaemonFrame) =>
    captureFrame(captured, frame)
  );
  // Per-operation raw bytes match exactly what the runner wrote, in order.
  // stderr lines carry their raw ANSI color codes (stripped client-side per caps).
  const RED: string = '[31m';
  const RESET: string = '[39m';
  expect(rawStreamText(captured, 'alpha')).toBe(`alpha-out ünïcode ✓\n${RED}alpha-err${RESET}\n`);
  expect(rawStreamText(captured, 'beta')).toBe(`beta-out ünïcode ✓\n${RED}beta-err${RESET}\n`);
  // The status line rides as a scoped activity event, not a log chunk.
  const alphaActivity: IDaemonEventEnvelope | undefined = captured.events.find(
    (envelope: IDaemonEventEnvelope) => isActivityFor(envelope, 'alpha')
  );
  expect(payloadJson(alphaActivity)).toContain('completed successfully');
});
