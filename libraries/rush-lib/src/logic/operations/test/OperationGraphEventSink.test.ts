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

import type { IReporterEmitEventInput, IReporterEventSink } from '@rushstack/rush-reporter';
import { MockWritable, StringBufferTerminalProvider, type ITerminalChunk } from '@rushstack/terminal';
import type { CollatedTerminal } from '@rushstack/stream-collator';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IOperationGraphEventSink } from '../OperationEventSink';
import type { IOperationExecutionResult } from '../IOperationExecutionResult';
import { OperationGraph, type IOperationGraphOptions } from '../OperationGraph';
import { OperationStatus } from '../OperationStatus';
import { Operation } from '../Operation';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import { MockOperationRunner } from './MockOperationRunner';
import {
  _getRushSessionDerivedExitStatus,
  _getRushSessionLifecycleEmitter,
  _getRushSessionTelemetryAggregate,
  RushSession
} from '../../../pluginFramework/RushSession';
import { attachReporterOperationEventSink } from '../ReporterOperationEventSink';

const mockPhase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: { self: new Set(), upstream: new Set() },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};

function createOperation(
  name: string,
  runner: IOperationRunner,
  phase: IPhase = mockPhase,
  projectName: string = name
): Operation {
  return new Operation({
    runner,
    logFilenameIdentifier: name,
    phase,
    project: { packageName: projectName } as unknown as RushConfigurationProject
  });
}

class RecordingSink implements IOperationGraphEventSink {
  public readonly registered: [string, boolean][] = [];
  public readonly transitions: [string, string][] = [];
  public readonly headers: [string, number, number][] = [];
  public readonly activities: string[] = [];
  public readonly chunks: Map<string, string[]> = new Map();

  public onOperationRegistered(result: IOperationExecutionResult, silent: boolean): void {
    this.registered.push([result.operation.name, silent]);
  }
  public onOperationStatusChanged(result: IOperationExecutionResult): void {
    this.transitions.push([result.operation.name, result.status]);
  }
  public onOperationHeader(operationId: string, completed: number, total: number): void {
    this.headers.push([operationId, completed, total]);
  }
  public onActivity(text: string): void {
    this.activities.push(text);
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

class CapturingReporterSink implements IReporterEventSink {
  public readonly inputs: IReporterEmitEventInput<unknown>[] = [];

  public emit<TPayload>(event: IReporterEmitEventInput<TPayload>): string {
    this.inputs.push(event);
    return `event-${this.inputs.length}`;
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

  it('emits phase-aware status and diagnostic events without routing operation chunks', async () => {
    const reporterSink: CapturingReporterSink = new CapturingReporterSink();
    const rushSession: RushSession = new RushSession({
      terminalProvider: new StringBufferTerminalProvider(),
      getIsDebugMode: () => false,
      reporter: { eventSink: reporterSink, sessionId: 'operation-shadow' }
    });
    const createFailingOperation = (): Operation =>
      createOperation(
        '@scope/project',
        new MockOperationRunner('@scope/project (phase)', async () => OperationStatus.Failure)
      );
    const plainWritable: MockWritable = new MockWritable();
    await new OperationGraph(
      new Set([createFailingOperation()]),
      createGraphOptions(plainWritable, false)
    ).executeAsync({});

    const operation: Operation = createFailingOperation();
    const graph: OperationGraph = new OperationGraph(
      new Set([operation]),
      createGraphOptions(mockWritable, false)
    );

    attachReporterOperationEventSink(graph, rushSession, 'build');
    await graph.executeAsync({});

    const operationEvents: IReporterEmitEventInput<unknown>[] = reporterSink.inputs.filter(
      ({ type }) => type === 'operationRegistered' || type === 'operationStatusChanged'
    );
    expect(operationEvents.length).toBeGreaterThan(1);
    for (const event of operationEvents) {
      expect(event.scope).toMatchObject({
        commandName: 'build',
        operationId: '@scope/project#phase',
        projectName: '@scope/project',
        phaseName: 'phase'
      });
    }
    expect(reporterSink.inputs).toContainEqual(
      expect.objectContaining({
        type: 'diagnosticEmitted',
        payload: expect.objectContaining({ code: 'RUSH_OPERATION_FAILED' })
      })
    );
    expect(reporterSink.inputs.some(({ type }) => type === 'externalOutput')).toBe(false);
    expect(mockWritable.getAllOutput()).toEqual(plainWritable.getAllOutput());
  });

  it('aggregates sharded records across mixed outcomes and repeated watch-style iterations', async () => {
    const reporterSink: CapturingReporterSink = new CapturingReporterSink();
    const rushSession: RushSession = new RushSession({
      terminalProvider: new StringBufferTerminalProvider(),
      getIsDebugMode: () => false,
      reporter: { eventSink: reporterSink, sessionId: 'sharded-operation-shadow' }
    });
    const projectName: string = '@scope/sharded';
    const preShardRunner: IOperationRunner = {
      name: `${projectName} (phase) - pre-shard`,
      reportTiming: false,
      silent: true,
      cacheable: false,
      warningsAreAllowed: false,
      isNoOp: true,
      executeAsync: async () => OperationStatus.NoOp,
      getConfigHash: () => 'pre-shard'
    };
    const shardOneRunner: MockOperationRunner = new MockOperationRunner(
      `${projectName} (phase) - shard 1/2`,
      async () => OperationStatus.Success
    );
    let shardTwoOutcome: OperationStatus = OperationStatus.Failure;
    const shardTwoRunner: MockOperationRunner = new MockOperationRunner(
      `${projectName} (phase) - shard 2/2`,
      async () => shardTwoOutcome
    );
    const collatorRunner: MockOperationRunner = new MockOperationRunner(
      `${projectName} (phase) - collate`,
      async () => OperationStatus.Success
    );
    const preShard: Operation = createOperation('pre-shard', preShardRunner, mockPhase, projectName);
    const shardOne: Operation = createOperation('shard-one', shardOneRunner, mockPhase, projectName);
    const shardTwo: Operation = createOperation('shard-two', shardTwoRunner, mockPhase, projectName);
    const collator: Operation = createOperation('collator', collatorRunner, mockPhase, projectName);
    shardOne.addDependency(preShard);
    shardTwo.addDependency(preShard);
    collator.addDependency(shardOne);
    collator.addDependency(shardTwo);
    const graph: OperationGraph = new OperationGraph(
      new Set([collator, preShard, shardOne, shardTwo]),
      createGraphOptions(mockWritable, false)
    );

    attachReporterOperationEventSink(graph, rushSession, 'build');
    await graph.executeAsync({});

    const reporterOperationId: string = `${projectName}#phase`;
    const operationEvents = (): IReporterEmitEventInput<unknown>[] =>
      reporterSink.inputs.filter(({ scope }) => scope?.operationId === reporterOperationId);
    expect(operationEvents().filter(({ type }) => type === 'operationRegistered')).toHaveLength(1);
    expect(
      operationEvents()
        .filter(({ type }) => type === 'operationStatusChanged')
        .at(-1)?.payload
    ).toMatchObject({ operationId: reporterOperationId, status: 'failure' });
    expect(
      operationEvents().filter(
        ({ type, payload }) =>
          type === 'diagnosticEmitted' && (payload as { code?: string }).code === 'RUSH_OPERATION_FAILED'
      )
    ).toHaveLength(1);
    expect(_getRushSessionTelemetryAggregate(rushSession)?.operationStatusCounts).toEqual({
      failure: 1
    });
    expect(_getRushSessionDerivedExitStatus(rushSession)).toEqual({
      exitCode: 1,
      outcome: 'failed'
    });

    shardTwoOutcome = OperationStatus.Success;
    graph.invalidateOperations(undefined, 'watch iteration');
    await graph.executeAsync({});

    expect(
      operationEvents()
        .filter(({ type }) => type === 'operationRegistered')
        .map(({ scope }) => scope?.operationId)
    ).toEqual([reporterOperationId, reporterOperationId]);
    expect(
      operationEvents()
        .filter(({ type }) => type === 'operationStatusChanged')
        .at(-1)?.payload
    ).toMatchObject({ operationId: reporterOperationId, status: 'success' });
    expect(
      operationEvents().filter(
        ({ type, payload }) =>
          type === 'diagnosticEmitted' && (payload as { code?: string }).code === 'RUSH_OPERATION_FAILED'
      )
    ).toHaveLength(1);
    expect(_getRushSessionTelemetryAggregate(rushSession)?.operationStatusCounts).toEqual({
      success: 1
    });
    expect(_getRushSessionDerivedExitStatus(rushSession)).toEqual({
      exitCode: 0,
      outcome: 'succeeded'
    });

    const lifecycleEmitter = _getRushSessionLifecycleEmitter(rushSession, { commandName: 'build' })!;
    lifecycleEmitter.emitCommandResult({ commandName: 'build', succeeded: true, exitCode: 0 });
    lifecycleEmitter.emitCommandCompleted({ commandName: 'build', exitCode: 0 });
    lifecycleEmitter.emitSessionCompleted({ exitCode: 0 });
    expect(_getRushSessionDerivedExitStatus(rushSession)).toEqual({
      exitCode: 0,
      outcome: 'succeeded'
    });
    expect(reporterSink.inputs.some(({ type }) => type === 'externalOutput')).toBe(false);
  });

  it('isolates diagnostics when the next watch iteration registers before abort completes', async () => {
    const reporterSink: CapturingReporterSink = new CapturingReporterSink();
    const rushSession: RushSession = new RushSession({
      terminalProvider: new StringBufferTerminalProvider(),
      getIsDebugMode: () => false,
      reporter: { eventSink: reporterSink, sessionId: 'overlapping-operation-shadow' }
    });
    let runCount: number = 0;
    let resolveFirstRun: ((status: OperationStatus) => void) | undefined;
    let markFirstRunStarted: (() => void) | undefined;
    const firstRunStarted: Promise<void> = new Promise<void>((resolve: () => void) => {
      markFirstRunStarted = resolve;
    });
    const runner: MockOperationRunner = new MockOperationRunner('@scope/overlap (phase)', async () => {
      runCount++;
      if (runCount === 1) {
        markFirstRunStarted!();
        return await new Promise<OperationStatus>((resolve: (status: OperationStatus) => void) => {
          resolveFirstRun = resolve;
        });
      }
      return OperationStatus.Failure;
    });
    const graph: OperationGraph = new OperationGraph(
      new Set([createOperation('overlap', runner, mockPhase, '@scope/overlap')]),
      { ...createGraphOptions(mockWritable, false), pauseNextIteration: true }
    );
    attachReporterOperationEventSink(graph, rushSession, 'build');

    await graph.scheduleIterationAsync({});
    const firstExecution: Promise<boolean> = graph.executeScheduledIterationAsync();
    await firstRunStarted;
    await graph.scheduleIterationAsync({});
    const abortPromise: Promise<void> = graph.abortCurrentIterationAsync();
    resolveFirstRun!(OperationStatus.Failure);
    await Promise.all([firstExecution, abortPromise]);
    await graph.executeScheduledIterationAsync();

    expect(
      reporterSink.inputs.filter(
        ({ type, payload }) =>
          type === 'diagnosticEmitted' && (payload as { code?: string }).code === 'RUSH_OPERATION_FAILED'
      )
    ).toHaveLength(2);
  });

  it('recomputes grouped silence for each watch-style iteration', async () => {
    const reporterSink: CapturingReporterSink = new CapturingReporterSink();
    const rushSession: RushSession = new RushSession({
      terminalProvider: new StringBufferTerminalProvider(),
      getIsDebugMode: () => false,
      reporter: { eventSink: reporterSink, sessionId: 'grouped-silence-shadow' }
    });
    const projectName: string = '@scope/silence';
    const first: Operation = createOperation(
      'first',
      new MockOperationRunner(`${projectName} (phase) - first`),
      mockPhase,
      projectName
    );
    const second: Operation = createOperation(
      'second',
      new MockOperationRunner(`${projectName} (phase) - second`),
      mockPhase,
      projectName
    );
    const graph: OperationGraph = new OperationGraph(
      new Set([first, second]),
      createGraphOptions(mockWritable, false)
    );

    attachReporterOperationEventSink(graph, rushSession, 'build');
    await graph.executeAsync({});

    const operationId: string = `${projectName}#phase`;
    const countEvents = (type: IReporterEmitEventInput<unknown>['type']): number =>
      reporterSink.inputs.filter(
        ({ type: eventType, scope }) => eventType === type && scope?.operationId === operationId
      ).length;
    const registrationCount: number = countEvents('operationRegistered');
    const statusCount: number = countEvents('operationStatusChanged');
    expect(registrationCount).toBe(1);
    expect(statusCount).toBeGreaterThan(0);

    first.enabled = false;
    second.enabled = false;
    graph.invalidateOperations(undefined, 'disable group');
    await graph.executeAsync({});

    expect(countEvents('operationRegistered')).toBe(registrationCount);
    expect(countEvents('operationStatusChanged')).toBe(statusCount);
  });
});
