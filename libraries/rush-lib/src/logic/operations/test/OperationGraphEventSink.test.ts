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
import {
  MockWritable,
  StringBufferTerminalProvider,
  TerminalProviderSeverity,
  type ITerminalChunk
} from '@rushstack/terminal';
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
  public readonly closed: string[] = [];
  public readonly completed: [string, string][] = [];

  public onOperationRegistered(operationId: string, silent: boolean): void {
    this.registered.push([operationId, silent]);
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
  public onOperationStreamClosed(operationId: string): void {
    this.closed.push(operationId);
  }
  public onOperationCompleted(result: IOperationExecutionResult): void {
    this.completed.push([result.operation.name, result.status]);
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
    expect([...sink.closed].sort()).toEqual(['alpha', 'beta']);
    expect([...sink.completed].sort()).toEqual([
      ['alpha', OperationStatus.Success],
      ['beta', OperationStatus.Success]
    ]);
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
      reporter: {
        eventSink: reporterSink,
        sessionId: 'operation-shadow',
        operationStreamEnabled: false
      }
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

  it('emits the opted-in canonical stream without duplicating or losing operation chunks', async () => {
    const stdoutText: string = `${'a'.repeat(64 * 1024 + 7)}\rprogress`;
    const stderrText: string = 'stderr detail\r';
    const createOutputRunner = (): IOperationRunner => ({
      name: '@scope/project (_phase:build)',
      reportTiming: true,
      silent: false,
      cacheable: false,
      warningsAreAllowed: true,
      isNoOp: false,
      executeAsync: async (context: IOperationRunnerContext) =>
        await context.runWithTerminalAsync(
          async (terminal, terminalProvider) => {
            void terminal;
            terminalProvider.write(stdoutText, TerminalProviderSeverity.log);
            terminalProvider.write(stderrText, TerminalProviderSeverity.error);
            return OperationStatus.SuccessWithWarning;
          },
          { createLogFile: false, logFileSuffix: '' }
        ),
      getConfigHash: () => 'mock'
    });

    const plainWritable: MockWritable = new MockWritable();
    await new OperationGraph(
      new Set([createOperation('@scope/project', createOutputRunner(), mockPhase, '@scope/project')]),
      createGraphOptions(plainWritable, false)
    ).executeAsync({});

    const reporterSink: CapturingReporterSink = new CapturingReporterSink();
    const rushSession: RushSession = new RushSession({
      terminalProvider: new StringBufferTerminalProvider(),
      getIsDebugMode: () => false,
      reporter: {
        eventSink: reporterSink,
        sessionId: 'operation-stream',
        operationStreamEnabled: true
      }
    });
    const streamedWritable: MockWritable = new MockWritable();
    const graph: OperationGraph = new OperationGraph(
      new Set([createOperation('@scope/project', createOutputRunner(), mockPhase, '@scope/project')]),
      createGraphOptions(streamedWritable, false)
    );

    attachReporterOperationEventSink(graph, rushSession, 'build');
    await graph.executeAsync({});

    expect(streamedWritable.getAllOutput()).toEqual(plainWritable.getAllOutput());

    const operationEvents: IReporterEmitEventInput<unknown>[] = reporterSink.inputs.filter(
      ({ scope }) => scope?.operationId === '@scope/project#phase'
    );
    expect(operationEvents[0]).toMatchObject({
      type: 'operationRegistered',
      payload: {
        operationId: '@scope/project#phase',
        projectName: '@scope/project',
        phaseName: 'phase',
        silent: false
      }
    });

    const statusEvents: IReporterEmitEventInput<unknown>[] = operationEvents.filter(
      ({ type }) => type === 'operationStatusChanged'
    );
    expect(statusEvents.map(({ payload }) => payload)).toEqual([
      expect.objectContaining({ previousStatus: 'ready', status: 'queued' }),
      expect.objectContaining({ previousStatus: 'queued', status: 'executing' }),
      expect.objectContaining({ previousStatus: 'executing', status: 'successWithWarnings' })
    ]);

    const outputEvents: IReporterEmitEventInput<unknown>[] = operationEvents.filter(
      ({ type }) => type === 'externalOutput'
    );
    expect(
      outputEvents.every(
        ({ payload }) => Buffer.byteLength((payload as { text: string }).text, 'utf8') <= 64 * 1024
      )
    ).toBe(true);
    const stdoutChunks: string = outputEvents
      .filter(({ payload }) => (payload as { stream: string }).stream === 'stdout')
      .map(({ payload }) => (payload as { text: string }).text)
      .join('');
    const stderrChunks: string = outputEvents
      .filter(({ payload }) => (payload as { stream: string }).stream === 'stderr')
      .map(({ payload }) => (payload as { text: string }).text)
      .join('');
    expect(stdoutChunks).toBe(stdoutText);
    expect(stderrChunks).toBe(stderrText);

    const closedIndex: number = operationEvents.findIndex(({ type }) => type === 'operationStreamClosed');
    const completedIndex: number = operationEvents.findIndex(({ type }) => type === 'operationCompleted');
    expect(closedIndex).toBeGreaterThan(operationEvents.lastIndexOf(outputEvents.at(-1)!));
    expect(completedIndex).toBeGreaterThan(closedIndex);
    expect(operationEvents[completedIndex].payload).toMatchObject({
      operationId: '@scope/project#phase',
      status: 'successWithWarnings'
    });
  });

  it('combines sharded implementation records into one project x phase stream', async () => {
    const reporterSink: CapturingReporterSink = new CapturingReporterSink();
    const rushSession: RushSession = new RushSession({
      terminalProvider: new StringBufferTerminalProvider(),
      getIsDebugMode: () => false,
      reporter: {
        eventSink: reporterSink,
        sessionId: 'sharded-operation-stream',
        operationStreamEnabled: true
      }
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
    const shardRunner: IOperationRunner = {
      name: `${projectName} (phase) - shard 1/1`,
      reportTiming: true,
      silent: false,
      cacheable: false,
      warningsAreAllowed: false,
      isNoOp: false,
      executeAsync: async (context: IOperationRunnerContext) =>
        await context.runWithTerminalAsync(
          async (terminal) => {
            terminal.write('shard output without newline');
            return OperationStatus.Failure;
          },
          { createLogFile: false, logFileSuffix: '' }
        ),
      getConfigHash: () => 'shard'
    };
    const collatorRunner: IOperationRunner = {
      name: `${projectName} (phase) - collate`,
      reportTiming: true,
      silent: false,
      cacheable: false,
      warningsAreAllowed: false,
      isNoOp: false,
      executeAsync: async () => OperationStatus.Success,
      getConfigHash: () => 'collate'
    };
    const preShard: Operation = createOperation('pre-shard', preShardRunner, mockPhase, projectName);
    const shard: Operation = createOperation('shard', shardRunner, mockPhase, projectName);
    const collator: Operation = createOperation('collator', collatorRunner, mockPhase, projectName);
    shard.addDependency(preShard);
    collator.addDependency(shard);
    const graph: OperationGraph = new OperationGraph(
      new Set([collator, preShard, shard]),
      createGraphOptions(mockWritable, false)
    );

    attachReporterOperationEventSink(graph, rushSession, 'build');
    await graph.executeAsync({});

    const operationEvents: IReporterEmitEventInput<unknown>[] = reporterSink.inputs.filter(
      ({ scope }) => scope?.operationId === `${projectName}#phase`
    );
    expect(operationEvents.filter(({ type }) => type === 'operationRegistered')).toHaveLength(1);
    expect(
      operationEvents
        .filter(({ type }) => type === 'externalOutput')
        .map(({ payload }) => (payload as { text: string }).text)
        .join('')
    ).toBe('shard output without newline');
    expect(operationEvents.filter(({ type }) => type === 'operationStreamClosed')).toHaveLength(1);
    expect(operationEvents.filter(({ type }) => type === 'operationCompleted')).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ operationId: `${projectName}#phase`, status: 'failure' })
      })
    ]);
    expect(
      operationEvents.filter(
        ({ type, payload }) =>
          type === 'diagnosticEmitted' && (payload as { code?: string }).code === 'RUSH_OPERATION_FAILED'
      )
    ).toHaveLength(1);
  });

  it('does not register operations when scheduling hooks reject the iteration', async () => {
    const sink: RecordingSink = new RecordingSink();
    const graph: OperationGraph = new OperationGraph(
      new Set([createOperation('hook failure', new MockOperationRunner('hook failure'))]),
      createGraphOptions(mockWritable, false)
    );
    graph.eventSink = sink;
    graph.hooks.onIterationScheduled.tap('test', () => {
      throw new Error('schedule rejected');
    });

    await expect(graph.executeAsync({})).rejects.toThrow('schedule rejected');
    expect(sink.registered).toEqual([]);
    expect(sink.closed).toEqual([]);
    expect(sink.completed).toEqual([]);
  });

  it('finalizes registered operations when the pre-execution hook rejects', async () => {
    const sink: RecordingSink = new RecordingSink();
    const graph: OperationGraph = new OperationGraph(
      new Set([createOperation('hook failure', new MockOperationRunner('hook failure'))]),
      createGraphOptions(mockWritable, false)
    );
    graph.eventSink = sink;
    graph.hooks.beforeExecuteIterationAsync.tapPromise('test', async () => {
      throw new Error('pre-execution rejected');
    });

    await expect(graph.executeAsync({})).rejects.toThrow('pre-execution rejected');
    expect(sink.registered).toEqual([['hook failure', false]]);
    expect(sink.closed).toEqual(['hook failure']);
    expect(sink.completed).toEqual([['hook failure', OperationStatus.Aborted]]);
  });

  it('reports silent operation metadata and outcomes on the opted-in stream', async () => {
    const silentRunner: IOperationRunner = {
      name: 'silent synthetic',
      reportTiming: false,
      silent: true,
      cacheable: false,
      warningsAreAllowed: false,
      isNoOp: false,
      executeAsync: async () => OperationStatus.Success,
      getConfigHash: () => 'silent'
    };
    const reporterSink: CapturingReporterSink = new CapturingReporterSink();
    const rushSession: RushSession = new RushSession({
      terminalProvider: new StringBufferTerminalProvider(),
      getIsDebugMode: () => false,
      reporter: {
        eventSink: reporterSink,
        sessionId: 'silent-operation',
        operationStreamEnabled: true
      }
    });
    const graph: OperationGraph = new OperationGraph(
      new Set([
        createOperation('visible', new MockOperationRunner('visible'), mockPhase, '@scope/visible'),
        createOperation('silent synthetic', silentRunner, mockPhase, '@scope/project')
      ]),
      createGraphOptions(mockWritable, false)
    );

    attachReporterOperationEventSink(graph, rushSession, 'build');
    await graph.executeAsync({});

    expect(reporterSink.inputs).toContainEqual(
      expect.objectContaining({
        type: 'operationRegistered',
        payload: expect.objectContaining({
          operationId: '@scope/project#phase',
          silent: true
        })
      })
    );
    expect(reporterSink.inputs).toContainEqual(
      expect.objectContaining({
        type: 'operationCompleted',
        payload: expect.objectContaining({
          operationId: '@scope/project#phase',
          status: 'success'
        })
      })
    );
  });

  it('does not attach an operation adapter when the session has no reporter sink', () => {
    const rushSession: RushSession = new RushSession({
      terminalProvider: new StringBufferTerminalProvider(),
      getIsDebugMode: () => false
    });
    const graph: OperationGraph = new OperationGraph(
      new Set([createOperation('no sink', new MockOperationRunner('no sink'))]),
      createGraphOptions(mockWritable, false)
    );

    attachReporterOperationEventSink(graph, rushSession, 'build');

    expect(graph.eventSink).toBeUndefined();
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

  it('keeps project x phase identities stable across repeated watch-style iterations', async () => {
    const reporterSink: CapturingReporterSink = new CapturingReporterSink();
    const rushSession: RushSession = new RushSession({
      terminalProvider: new StringBufferTerminalProvider(),
      getIsDebugMode: () => false,
      reporter: {
        eventSink: reporterSink,
        sessionId: 'operation-retries',
        operationStreamEnabled: true
      }
    });
    const compilePhase: IPhase = {
      ...mockPhase,
      name: '_phase:compile',
      logFilenameIdentifier: '_phase_compile'
    };
    const testPhase: IPhase = {
      ...mockPhase,
      name: '_phase:test',
      logFilenameIdentifier: '_phase_test'
    };
    const graph: OperationGraph = new OperationGraph(
      new Set([
        createOperation(
          '@scope/project compile',
          new MockOperationRunner('@scope/project (_phase:compile)'),
          compilePhase,
          '@scope/project'
        ),
        createOperation(
          '@scope/project test',
          new MockOperationRunner('@scope/project (_phase:test)'),
          testPhase,
          '@scope/project'
        )
      ]),
      createGraphOptions(mockWritable, false)
    );

    attachReporterOperationEventSink(graph, rushSession, 'build');
    await graph.executeAsync({});
    graph.invalidateOperations(undefined, 'watch iteration');
    await graph.executeAsync({});

    const registrations: IReporterEmitEventInput<unknown>[] = reporterSink.inputs.filter(
      ({ type }) => type === 'operationRegistered'
    );
    expect(registrations.map(({ scope }) => scope?.operationId)).toEqual([
      '@scope/project#_phase:compile',
      '@scope/project#_phase:test',
      '@scope/project#_phase:compile',
      '@scope/project#_phase:test'
    ]);
    expect(
      reporterSink.inputs
        .filter(({ type }) => type === 'operationCompleted')
        .map(({ scope }) => scope?.operationId)
    ).toEqual([
      '@scope/project#_phase:compile',
      '@scope/project#_phase:test',
      '@scope/project#_phase:compile',
      '@scope/project#_phase:test'
    ]);
    for (const event of reporterSink.inputs.filter(({ type }) => type === 'operationStatusChanged')) {
      expect(event.scope?.operationId).toBe(`@scope/project#${event.scope?.phaseName}`);
      expect((event.payload as { operationId: string }).operationId).toBe(event.scope?.operationId);
    }
  });

  it('leaves stdout, stderr, and StreamCollator rendering byte-identical with shadow reporting', async () => {
    const createOutputRunner = (): MockOperationRunner =>
      new MockOperationRunner('output', async (terminal: CollatedTerminal) => {
        terminal.writeStdoutLine('shadow parity stdout');
        terminal.writeStderrLine('shadow parity stderr');
        return OperationStatus.Success;
      });

    const plainWritable: MockWritable = new MockWritable();
    await new OperationGraph(
      new Set([createOperation('output', createOutputRunner())]),
      createGraphOptions(plainWritable, false)
    ).executeAsync({});

    const reporterSink: CapturingReporterSink = new CapturingReporterSink();
    const rushSession: RushSession = new RushSession({
      terminalProvider: new StringBufferTerminalProvider(),
      getIsDebugMode: () => false,
      reporter: {
        eventSink: reporterSink,
        sessionId: 'output-parity',
        operationStreamEnabled: false
      }
    });
    const shadowWritable: MockWritable = new MockWritable();
    const shadowGraph: OperationGraph = new OperationGraph(
      new Set([createOperation('output', createOutputRunner())]),
      createGraphOptions(shadowWritable, false)
    );
    attachReporterOperationEventSink(shadowGraph, rushSession, 'build');
    expect(shadowGraph.eventSink?.onOperationChunk).toBeUndefined();
    await shadowGraph.executeAsync({});
    expect(shadowWritable.getAllOutput()).toEqual(plainWritable.getAllOutput());
    expect(reporterSink.inputs.some(({ type }) => type === 'externalOutput')).toBe(false);
  });
});
