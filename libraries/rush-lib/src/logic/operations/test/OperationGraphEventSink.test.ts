// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Deterministic Stopwatch timing, matching OperationGraph.test.ts
jest.mock('@rushstack/terminal', () => {
  const originalModule = jest.requireActual('@rushstack/terminal');
  return {
    ...originalModule,
    ConsoleTerminalProvider: {
      ...originalModule.ConsoleTerminalProvider,
      supportsColor: true
    }
  };
});

jest.mock('../../../utilities/Utilities');
jest.mock('../OperationStateFile');
jest.mock('../ProjectLogWritable', () => {
  const actual = jest.requireActual('../ProjectLogWritable');
  const terminalModule = jest.requireActual('@rushstack/terminal');
  const { TerminalWritable } = terminalModule;
  class MockTerminalWritable extends TerminalWritable {
    public readonly chunks: string[] = [];
    protected onWriteChunk(chunk: { text: string }): void {
      this.chunks.push(chunk.text);
    }
    protected onClose(): void {
      /* noop */
    }
  }
  return {
    ...actual,
    initializeProjectLogFilesAsync: jest.fn(async () => new MockTerminalWritable())
  };
});

import { MockWritable, type ITerminalChunk } from '@rushstack/terminal';
import type { CollatedTerminal } from '@rushstack/stream-collator';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IOperationActivityOptions, IOperationGraphEventSink } from '../OperationEventSink';
import type { IOperationExecutionResult } from '../IOperationExecutionResult';
import { OperationGraph, type IOperationGraphOptions } from '../OperationGraph';
import { OperationStatus } from '../OperationStatus';
import { Operation } from '../Operation';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import { MockOperationRunner } from './MockOperationRunner';

const mockPhase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: { self: new Set(), upstream: new Set() },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};

function createOperation(name: string, runner: IOperationRunner): Operation {
  return new Operation({
    runner,
    logFilenameIdentifier: name,
    phase: mockPhase,
    project: { packageName: name } as unknown as RushConfigurationProject
  });
}

class RecordingSink implements IOperationGraphEventSink {
  public readonly registered: [string, boolean][] = [];
  public readonly transitions: [string, string][] = [];
  public readonly headers: [string, number, number][] = [];
  public readonly activities: string[] = [];
  public readonly activityScopes: Array<string | undefined> = [];
  public readonly chunks: Map<string, string[]> = new Map();

  public onOperationRegistered(operationId: string, silent: boolean): void {
    this.registered.push([operationId, silent]);
  }
  public onOperationStatusChanged(result: IOperationExecutionResult): void {
    this.transitions.push([result.operation.name, result.status]);
  }
  public onOperationHeader(operationId: string, completed: number, total: number): void {
    this.headers.push([operationId, completed, total]);
  }
  public onActivity(text: string, options?: IOperationActivityOptions): void {
    this.activities.push(text);
    this.activityScopes.push(options?.operationId);
  }
  public onOperationChunk(operationId: string, chunk: ITerminalChunk): void {
    let chunks: string[] | undefined = this.chunks.get(operationId);
    if (!chunks) {
      chunks = [];
      this.chunks.set(operationId, chunks);
    }
    chunks.push(chunk.text);
  }
}

function createGraphOptions(mockWritable: MockWritable, quietMode: boolean): IOperationGraphOptions {
  return {
    quietMode,
    debugMode: false,
    parallelism: 1,
    allowOversubscription: true,
    destinations: [mockWritable],
    abortController: new AbortController()
  };
}

describe('OperationGraph event sink (dual-emit)', () => {
  let mockWritable: MockWritable;
  beforeEach(() => {
    mockWritable = new MockWritable();
  });

  it('emits registration, transitions, headers, and activity lines for every operation', async () => {
    const sink: RecordingSink = new RecordingSink();
    const graph: OperationGraph = new OperationGraph(
      new Set([
        createOperation('alpha', new MockOperationRunner('alpha', async () => OperationStatus.Success)),
        createOperation('beta', new MockOperationRunner('beta', async () => OperationStatus.Success))
      ]),
      createGraphOptions(mockWritable, false)
    );
    graph.eventSink = sink;

    await graph.executeAsync({});

    expect(sink.registered.map(([name]) => name).sort()).toEqual(['alpha', 'beta']);
    for (const name of ['alpha', 'beta']) {
      const statuses: string[] = sink.transitions
        .filter(([opName]) => opName === name)
        .map(([, status]) => status);
      expect(statuses).toEqual([OperationStatus.Queued, OperationStatus.Executing, OperationStatus.Success]);
    }
    const sortedHeaders: [string, number, number][] = [...sink.headers].sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    expect(sortedHeaders).toEqual([
      ['alpha', expect.any(Number), 2],
      ['beta', expect.any(Number), 2]
    ]);
    expect(sink.headers.map(([, completed]) => completed).sort()).toEqual([1, 2]);
    expect(sink.activities).toContain('Selected 2 operations:');
    expect(sink.activities.some((line: string) => line.includes('simultaneous processes'))).toBe(true);
    expect(sink.activities.some((line: string) => line.includes('"alpha" completed successfully'))).toBe(
      true
    );
  });

  it('emits raw per-operation chunks even in quiet mode, matching the collated stream', async () => {
    const sink: RecordingSink = new RecordingSink();
    // Use runWithTerminalAsync like the production runners (ShellOperationRunner,
    // IPCOperationRunner) do, so output flows through the tapped pipeline.
    const runner: IOperationRunner = {
      name: 'logger',
      reportTiming: true,
      silent: false,
      cacheable: false,
      warningsAreAllowed: false,
      isNoOp: false,
      executeAsync: async (context: IOperationRunnerContext) =>
        await context.runWithTerminalAsync(
          async (terminal) => {
            terminal.writeLine('quiet-hidden-stdout');
            terminal.writeErrorLine('quiet-visible-stderr');
            return OperationStatus.Success;
          },
          { createLogFile: false, logFileSuffix: '' }
        ),
      getConfigHash: () => 'mock'
    };
    const graph: OperationGraph = new OperationGraph(
      new Set([createOperation('logger', runner)]),
      createGraphOptions(mockWritable, true)
    );
    graph.eventSink = sink;

    await graph.executeAsync({});

    const tappedText: string = (sink.chunks.get('logger') ?? []).join('');
    expect(tappedText).toContain('quiet-hidden-stdout');
    expect(tappedText).toContain('quiet-visible-stderr');
    // Quiet mode discards stdout from the collated terminal, but the tap still saw it.
    expect(mockWritable.getAllOutput()).not.toContain('quiet-hidden-stdout');
  });

  it('scopes blocked-operation activity to the stream that writes it', async () => {
    const sink: RecordingSink = new RecordingSink();
    const failingOperation: Operation = createOperation(
      'fail',
      new MockOperationRunner('fail', async () => OperationStatus.Failure)
    );
    const blockedOperation: Operation = createOperation(
      'blocked',
      new MockOperationRunner('blocked', async () => OperationStatus.Success)
    );
    blockedOperation.addDependency(failingOperation);
    const graph: OperationGraph = new OperationGraph(
      new Set([failingOperation, blockedOperation]),
      createGraphOptions(mockWritable, false)
    );
    graph.eventSink = sink;

    await graph.executeAsync({});

    const blockedActivityIndex: number = sink.activities.findIndex((line: string) =>
      line.includes('"blocked" is blocked by "fail"')
    );
    expect(sink.activityScopes[blockedActivityIndex]).toBe('fail');
    expect(sink.headers.some(([operationId]) => operationId === 'fail')).toBe(true);
    expect(sink.headers.some(([operationId]) => operationId === 'blocked')).toBe(false);
  });

  it('leaves terminal output byte-identical whether or not a sink is attached', async () => {
    const makeRunner: () => MockOperationRunner = () =>
      new MockOperationRunner('echo', async (terminal: CollatedTerminal) => {
        terminal.writeStdoutLine('hello from echo');
        return OperationStatus.Success;
      });

    const plainWritable: MockWritable = new MockWritable();
    await new OperationGraph(
      new Set([createOperation('echo', makeRunner())]),
      createGraphOptions(plainWritable, false)
    ).executeAsync({});

    const tappedWritable: MockWritable = new MockWritable();
    const tappedGraph: OperationGraph = new OperationGraph(
      new Set([createOperation('echo', makeRunner())]),
      createGraphOptions(tappedWritable, false)
    );
    tappedGraph.eventSink = new RecordingSink();
    await tappedGraph.executeAsync({});

    expect(tappedWritable.getAllOutput()).toEqual(plainWritable.getAllOutput());
  });
});
