// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGraph } from '@microsoft/rush-lib';
import type { IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';
import { TerminalProviderSeverity } from '@rushstack/terminal';

import { EngineTerminalProvider } from '../EngineTerminalProvider';
import { PhasedRequestEventMultiplexer } from '../PhasedRequestEventMultiplexer';
import { PhasedRequestEventSink } from '../PhasedRequestEventSink';
import { TestPhasedRequestClient } from './PhasedRequestRouterTestUtilities';

type HookName = 'configureIteration' | 'beforeExecuteIterationAsync' | 'afterExecuteIterationAsync';

interface IActivityHarness {
  readonly client: TestPhasedRequestClient;
  readonly sink: PhasedRequestEventSink;
  readonly terminal: EngineTerminalProvider;
  callHook(name: HookName): void;
}

function createHarness(): IActivityHarness {
  const taps: Map<HookName, () => void> = new Map();
  const hook = (name: HookName): { tap(options: unknown, fn: () => void): void } => ({
    tap: (options: unknown, fn: () => void) => taps.set(name, fn)
  });
  const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer(undefined);
  const graph: IOperationGraph = {
    debugMode: false,
    eventSink: multiplexer,
    hooks: {
      configureIteration: hook('configureIteration'),
      beforeExecuteIterationAsync: hook('beforeExecuteIterationAsync'),
      afterExecuteIterationAsync: hook('afterExecuteIterationAsync')
    }
  } as unknown as IOperationGraph;
  const client: TestPhasedRequestClient = new TestPhasedRequestClient();
  const sink: PhasedRequestEventSink = new PhasedRequestEventSink({
    activeOperationIds: new Set(),
    client,
    getNextSequence: () => client.getNextEventSequence(),
    onWriteFailure: () => undefined,
    rushVersion: '5.178.1'
  });
  multiplexer.subscribe(sink);
  const terminal: EngineTerminalProvider = new EngineTerminalProvider();
  terminal.attach(graph);
  return { client, sink, terminal, callHook: (name: HookName) => taps.get(name)!() };
}

async function getActivityPayloadsAsync(harness: IActivityHarness): Promise<unknown[]> {
  await harness.sink.flushAsync();
  return harness.client.writes
    .map(({ event }) => event)
    .filter((event: IDaemonEventEnvelope | undefined) => event?.type === 'activityChanged')
    .map((event: IDaemonEventEnvelope | undefined) => event!.payload);
}

describe('engine terminal activity', () => {
  it('marks warnings and errors that Rush or a plugin writes, whether buffered or written during an iteration', async () => {
    const harness: IActivityHarness = createHarness();
    harness.terminal.write('buffered warning\n', TerminalProviderSeverity.warning);
    harness.terminal.write('buffered output\n', TerminalProviderSeverity.log);
    harness.callHook('configureIteration');
    harness.callHook('beforeExecuteIterationAsync');
    harness.terminal.write('plugin warning\n', TerminalProviderSeverity.warning);
    harness.terminal.write('plugin error\n', TerminalProviderSeverity.error);
    harness.terminal.write('plugin output\n', TerminalProviderSeverity.log);
    harness.terminal.write('plugin detail\n', TerminalProviderSeverity.verbose);

    expect(await getActivityPayloadsAsync(harness)).toStrictEqual([
      { severity: 'warning', stream: 'stderr', text: 'buffered warning\n' },
      { stream: 'stdout', text: 'buffered output\n' },
      { severity: 'warning', stream: 'stderr', text: 'plugin warning\n' },
      { severity: 'error', stream: 'stderr', text: 'plugin error\n' },
      { stream: 'stdout', text: 'plugin output\n' }
    ]);
  });

  it('leaves other activity, such as the end-of-run summary, without a severity', async () => {
    const harness: IActivityHarness = createHarness();
    harness.sink.onActivity('Operations failed.\n', { stderr: true });
    harness.sink.onActivity('rush build (1.00 seconds)\n');

    expect(await getActivityPayloadsAsync(harness)).toStrictEqual([
      { stream: 'stderr', text: 'Operations failed.\n' },
      { stream: 'stdout', text: 'rush build (1.00 seconds)\n' }
    ]);
  });
});
