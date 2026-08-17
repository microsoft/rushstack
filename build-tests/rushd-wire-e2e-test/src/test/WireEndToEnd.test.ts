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

import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';
import type { DaemonVerbosity } from '@rushstack/rush-daemon-protocol';
import { DaemonRendererHost } from '@rushstack/rush-terminal-renderer';

import { runEngineScenarioAsync } from './EngineScenario';
import type { IEngineScenarioResult } from './EngineScenario';
import { dispatchFrame } from './FrameDispatch';
import { CollectingTerminal } from './TestWritable';
import { replayFramesOverSocketAsync } from './WireDriver';

async function renderOverWireAsync(
  result: IEngineScenarioResult,
  verbosity: DaemonVerbosity
): Promise<CollectingTerminal> {
  const terminal: CollectingTerminal = new CollectingTerminal();
  const host: DaemonRendererHost = new DaemonRendererHost({ terminal, verbosity });
  await host.initializeAsync();
  await replayFramesOverSocketAsync(result.adapter.frames, (frame: IDaemonFrame) =>
    dispatchFrame(host, frame)
  );
  await host.closeAsync();
  return terminal;
}

it('renders the wire stream byte-identically to the in-process legacy output', async () => {
  const result: IEngineScenarioResult = await runEngineScenarioAsync({ quiet: false });
  const terminal: CollectingTerminal = await renderOverWireAsync(result, 'normal');
  expect(terminal.stdout).toBe(result.writable.stdout);
  expect(terminal.stderr).toBe(result.writable.stderr);
  expect(terminal.stdout).toContain('Selected 2 operations:');
  expect(terminal.stdout).toContain('==[');
});

it('renders quiet-mode clients byte-identically to legacy quiet output', async () => {
  const result: IEngineScenarioResult = await runEngineScenarioAsync({ quiet: true });
  const terminal: CollectingTerminal = await renderOverWireAsync(result, 'quiet');
  expect(terminal.stdout).toBe(result.writable.stdout);
  expect(terminal.stderr).toBe(result.writable.stderr);
});

it('carries the failure status and error text over the wire', async () => {
  const result: IEngineScenarioResult = await runEngineScenarioAsync({ quiet: false, failing: true });
  const terminal: CollectingTerminal = await renderOverWireAsync(result, 'normal');
  expect(terminal.stdout).toBe(result.writable.stdout);
  expect(terminal.stdout + terminal.stderr).toContain('beta-err');
});
