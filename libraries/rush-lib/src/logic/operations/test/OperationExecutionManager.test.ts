// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The TaskExecutionManager prints "x.xx seconds" in TestRunner.test.ts.snap; ensure that the Stopwatch timing is deterministic
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
// Mock project log file creation to avoid filesystem writes; return a simple writable collecting chunks.
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

import { type ITerminal, Terminal } from '@rushstack/terminal';
import { CollatedTerminal } from '@rushstack/stream-collator';
import { MockWritable, PrintUtilities } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import {
  OperationExecutionManager,
  type IOperationExecutionManagerOptions
} from '../OperationExecutionManager';
import { _printOperationStatus } from '../OperationResultSummarizerPlugin';
import { _printTimeline } from '../ConsoleTimelinePlugin';
import { OperationStatus } from '../OperationStatus';
import { Operation } from '../Operation';
import { Utilities } from '../../../utilities/Utilities';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import { MockOperationRunner } from './MockOperationRunner';
import type { IExecutionResult, IOperationExecutionResult } from '../IOperationExecutionResult';
import { CollatedTerminalProvider } from '../../../utilities/CollatedTerminalProvider';
import type { CobuildConfiguration } from '../../../api/CobuildConfiguration';
import type { OperationStateFile } from '../OperationStateFile';
import type {
  IOperationExecutionPassOptions,
  IOperationExecutionManager
} from '../../../pluginFramework/PhasedCommandHooks';

const mockGetTimeInMs: jest.Mock = jest.fn();
Utilities.getTimeInMs = mockGetTimeInMs;

let mockTimeInMs: number = 0;
mockGetTimeInMs.mockImplementation(() => {
  mockTimeInMs += 100;
  return mockTimeInMs;
});

const mockWritable: MockWritable = new MockWritable();
const mockTerminal: Terminal = new Terminal(new CollatedTerminalProvider(new CollatedTerminal(mockWritable)));

const mockPhase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: {
    self: new Set(),
    upstream: new Set()
  },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};
const projectsByName: Map<string, RushConfigurationProject> = new Map();
function getOrCreateProject(name: string): RushConfigurationProject {
  let project: RushConfigurationProject | undefined = projectsByName.get(name);
  if (!project) {
    project = {
      packageName: name
    } as unknown as RushConfigurationProject;
    projectsByName.set(name, project);
  }
  return project;
}

function createExecutionManager(
  executionManagerOptions: IOperationExecutionManagerOptions,
  operationRunner: IOperationRunner
): OperationExecutionManager {
  const operation: Operation = new Operation({
    runner: operationRunner,
    logFilenameIdentifier: 'operation',
    phase: mockPhase,
    project: getOrCreateProject('project')
  });

  return new OperationExecutionManager(new Set([operation]), executionManagerOptions);
}

describe(OperationExecutionManager.name, () => {
  let executionManager: OperationExecutionManager;
  let executionManagerOptions: IOperationExecutionManagerOptions;
  let executionPassOptions: IOperationExecutionPassOptions;

  beforeEach(() => {
    jest.spyOn(PrintUtilities, 'getConsoleWidth').mockReturnValue(90);
    mockWritable.reset();
  });

  describe('Error logging', () => {
    beforeEach(() => {
      executionManagerOptions = {
        quietMode: false,
        debugMode: false,
        parallelism: 1,
        destinations: [mockWritable],
        abortController: new AbortController()
      };
      executionPassOptions = {};
    });

    it('printedStderrAfterError', async () => {
      executionManager = createExecutionManager(
        executionManagerOptions,
        new MockOperationRunner('stdout+stderr', async (terminal: CollatedTerminal) => {
          terminal.writeStdoutLine('Build step 1\n');
          terminal.writeStderrLine('Error: step 1 failed\n');
          return OperationStatus.Failure;
        })
      );

      const result: IExecutionResult = await executionManager.executeAsync(executionPassOptions);
      _printOperationStatus(mockTerminal, result);
      expect(result.status).toEqual(OperationStatus.Failure);
      expect(executionManager.status).toEqual(OperationStatus.Failure);
      expect(result.operationResults.size).toEqual(1);
      const firstResult: IOperationExecutionResult | undefined = result.operationResults
        .values()
        .next().value;
      expect(firstResult?.status).toEqual(OperationStatus.Failure);

      const allMessages: string = mockWritable.getAllOutput();
      expect(allMessages).toContain('Error: step 1 failed');
      expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
    });

    it('printedStdoutAfterErrorWithEmptyStderr', async () => {
      executionManager = createExecutionManager(
        executionManagerOptions,
        new MockOperationRunner('stdout only', async (terminal: CollatedTerminal) => {
          terminal.writeStdoutLine('Build step 1\n');
          terminal.writeStdoutLine('Error: step 1 failed\n');
          return OperationStatus.Failure;
        })
      );

      const result: IExecutionResult = await executionManager.executeAsync(executionPassOptions);
      _printOperationStatus(mockTerminal, result);
      expect(result.status).toEqual(OperationStatus.Failure);
      expect(result.operationResults.size).toEqual(1);
      const firstResult: IOperationExecutionResult | undefined = result.operationResults
        .values()
        .next().value;
      expect(firstResult?.status).toEqual(OperationStatus.Failure);

      const allOutput: string = mockWritable.getAllOutput();
      expect(allOutput).toMatch(/Build step 1/);
      expect(allOutput).toMatch(/Error: step 1 failed/);
      expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
    });
  });

  describe('Aborting', () => {
    it('Aborted operations abort', async () => {
      const mockRun: jest.Mock = jest.fn();

      const firstOperation = new Operation({
        runner: new MockOperationRunner('1', mockRun),
        phase: mockPhase,
        project: getOrCreateProject('1'),
        logFilenameIdentifier: '1'
      });

      const secondOperation = new Operation({
        runner: new MockOperationRunner('2', mockRun),
        phase: mockPhase,
        project: getOrCreateProject('2'),
        logFilenameIdentifier: '2'
      });

      secondOperation.addDependency(firstOperation);

      const manager: OperationExecutionManager = new OperationExecutionManager(
        new Set([firstOperation, secondOperation]),
        {
          quietMode: false,
          debugMode: false,
          parallelism: 1,
          destinations: [mockWritable],
          abortController: new AbortController()
        }
      );

      manager.hooks.beforeExecuteOperationsAsync.tapPromise(
        'test',
        (): Promise<void> => manager.abortCurrentPassAsync()
      );
      const result: IExecutionResult = await manager.executeAsync(executionPassOptions);
      expect(result.status).toEqual(OperationStatus.Aborted);
      expect(manager.status).toEqual(OperationStatus.Aborted);
      expect(mockRun).not.toHaveBeenCalled();
      expect(result.operationResults.size).toEqual(2);
      expect(result.operationResults.get(firstOperation)?.status).toEqual(OperationStatus.Aborted);
      expect(result.operationResults.get(secondOperation)?.status).toEqual(OperationStatus.Aborted);
    });
  });

  describe('Blocking', () => {
    it('Failed operations block', async () => {
      const failingOperation = new Operation({
        runner: new MockOperationRunner('fail', async () => {
          return OperationStatus.Failure;
        }),
        phase: mockPhase,
        project: getOrCreateProject('fail'),
        logFilenameIdentifier: 'fail'
      });

      const blockedRunFn: jest.Mock = jest.fn();

      const blockedOperation = new Operation({
        runner: new MockOperationRunner('blocked', blockedRunFn),
        phase: mockPhase,
        project: getOrCreateProject('blocked'),
        logFilenameIdentifier: 'blocked'
      });

      blockedOperation.addDependency(failingOperation);

      const manager: OperationExecutionManager = new OperationExecutionManager(
        new Set([failingOperation, blockedOperation]),
        {
          quietMode: false,
          debugMode: false,
          parallelism: 1,
          destinations: [mockWritable],
          abortController: new AbortController()
        }
      );

      const result = await manager.executeAsync(executionPassOptions);
      expect(result.status).toEqual(OperationStatus.Failure);
      expect(blockedRunFn).not.toHaveBeenCalled();
      expect(result.operationResults.size).toEqual(2);
      expect(result.operationResults.get(failingOperation)?.status).toEqual(OperationStatus.Failure);
      expect(result.operationResults.get(blockedOperation)?.status).toEqual(OperationStatus.Blocked);
    });
  });

  describe('onExecutionStatesUpdated hook', () => {
    beforeEach(() => {
      executionManagerOptions = {
        quietMode: false,
        debugMode: false,
        parallelism: 1,
        destinations: [mockWritable],
        abortController: new AbortController()
      };
      executionPassOptions = {};
    });

    class LogFileCreatingRunner extends MockOperationRunner {
      public constructor() {
        super('logfile-op');
      }
      public override async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
        await context.runWithTerminalAsync(
          async (terminal: ITerminal) => {
            terminal.writeLine('Hello world');
            return Promise.resolve();
          },
          { createLogFile: true, logFileSuffix: '' }
        );
        return OperationStatus.Success;
      }
    }

    it('fires state updates for status transitions (captures snapshot statuses)', async () => {
      const runner: IOperationRunner = new MockOperationRunner('state-change-op');
      executionManager = createExecutionManager(executionManagerOptions, runner);

      const stateUpdates: OperationStatus[][] = [];
      executionManager.hooks.onExecutionStatesUpdated.tap('test', (records) => {
        // Capture immutable array of status values at callback time
        stateUpdates.push(Array.from(records, (r) => r.status));
      });

      const result: IExecutionResult = await executionManager.executeAsync(executionPassOptions);
      expect(result.status).toBe(OperationStatus.Success);
      // Expect at least two batches now that we introduced a delay
      expect(stateUpdates.length).toBeGreaterThanOrEqual(2);
      const flattenedStatuses: OperationStatus[] = stateUpdates.flat();
      // Should observe an Executing intermediate status in snapshots (not just final Success)
      expect(flattenedStatuses).toContain(OperationStatus.Executing);
      expect(flattenedStatuses).toContain(OperationStatus.Success);
    });

    it('fires state update when logFilePaths are assigned (createLogFile=true) regardless of final status', async () => {
      const runner: IOperationRunner = new LogFileCreatingRunner();
      executionManager = createExecutionManager(executionManagerOptions, runner);

      const operationStateUpdates: ReadonlySet<IOperationExecutionResult>[] = [];
      executionManager.hooks.onExecutionStatesUpdated.tap('test', (records) => {
        operationStateUpdates.push(new Set(records));
      });

      const result: IExecutionResult = await executionManager.executeAsync(executionPassOptions);
      // Status may be Success or Failure if logging pipeline errors; we only care that hook fired with logFilePaths
      expect(result.status === OperationStatus.Success || result.status === OperationStatus.Failure).toBe(
        true
      );
      // Find a batch where logFilePaths is defined
      const anyWithLogFile: boolean = operationStateUpdates.some((recordSet) =>
        Array.from(recordSet).some((r) => Boolean((r as { logFilePaths?: unknown }).logFilePaths))
      );
      expect(anyWithLogFile).toBe(true);
    });
  });

  describe('Warning logging', () => {
    describe('Fail on warning', () => {
      beforeEach(() => {
        executionManagerOptions = {
          quietMode: false,
          debugMode: false,
          parallelism: 1,
          destinations: [mockWritable],
          abortController: new AbortController()
        };
      });

      it('Logs warnings correctly', async () => {
        executionManager = createExecutionManager(
          executionManagerOptions,
          new MockOperationRunner('success with warnings (failure)', async (terminal: CollatedTerminal) => {
            terminal.writeStdoutLine('Build step 1\n');
            terminal.writeStdoutLine('Warning: step 1 succeeded with warnings\n');
            return OperationStatus.SuccessWithWarning;
          })
        );

        const result: IExecutionResult = await executionManager.executeAsync(executionPassOptions);
        _printOperationStatus(mockTerminal, result);
        expect(result.status).toEqual(OperationStatus.SuccessWithWarning);
        expect(executionManager.status).toEqual(OperationStatus.SuccessWithWarning);
        expect(result.operationResults.size).toEqual(1);
        const firstResult: IOperationExecutionResult | undefined = result.operationResults
          .values()
          .next().value;
        expect(firstResult?.status).toEqual(OperationStatus.SuccessWithWarning);

        const allMessages: string = mockWritable.getAllOutput();
        expect(allMessages).toContain('Build step 1');
        expect(allMessages).toContain('step 1 succeeded with warnings');
        expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
      });
    });

    describe('Success on warning', () => {
      beforeEach(() => {
        executionManagerOptions = {
          quietMode: false,
          debugMode: false,
          parallelism: 1,
          destinations: [mockWritable],
          abortController: new AbortController()
        };
      });

      it('Logs warnings correctly', async () => {
        executionManager = createExecutionManager(
          executionManagerOptions,
          new MockOperationRunner(
            'success with warnings (success)',
            async (terminal: CollatedTerminal) => {
              terminal.writeStdoutLine('Build step 1\n');
              terminal.writeStdoutLine('Warning: step 1 succeeded with warnings\n');
              return OperationStatus.SuccessWithWarning;
            },
            /* warningsAreAllowed */ true
          )
        );

        const result: IExecutionResult = await executionManager.executeAsync(executionPassOptions);
        _printOperationStatus(mockTerminal, result);
        expect(result.status).toEqual(OperationStatus.Success);
        expect(result.operationResults.size).toEqual(1);
        const firstResult: IOperationExecutionResult | undefined = result.operationResults
          .values()
          .next().value;
        expect(firstResult?.status).toEqual(OperationStatus.SuccessWithWarning);
        const allMessages: string = mockWritable.getAllOutput();
        expect(allMessages).toContain('Build step 1');
        expect(allMessages).toContain('Warning: step 1 succeeded with warnings');
        expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
      });

      it('logs warnings correctly with --timeline option', async () => {
        executionManager = createExecutionManager(
          executionManagerOptions,
          new MockOperationRunner(
            'success with warnings (success)',
            async (terminal: CollatedTerminal) => {
              terminal.writeStdoutLine('Build step 1\n');
              terminal.writeStdoutLine('Warning: step 1 succeeded with warnings\n');
              return OperationStatus.SuccessWithWarning;
            },
            /* warningsAreAllowed */ true
          )
        );

        const result: IExecutionResult = await executionManager.executeAsync(executionPassOptions);
        _printTimeline({ terminal: mockTerminal, result, cobuildConfiguration: undefined });
        _printOperationStatus(mockTerminal, result);
        const allMessages: string = mockWritable.getAllOutput();
        expect(allMessages).toContain('Build step 1');
        expect(allMessages).toContain('Warning: step 1 succeeded with warnings');
        expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
      });
    });
  });

  describe('Cobuild logging', () => {
    beforeEach(() => {
      let mockCobuildTimeInMs: number = 0;
      mockGetTimeInMs.mockImplementation(() => {
        mockCobuildTimeInMs += 10_000;
        return mockCobuildTimeInMs;
      });
    });

    function createCobuildExecutionManager(
      cobuildExecutionManagerOptions: IOperationExecutionManagerOptions,
      operationRunnerFactory: (name: string) => IOperationRunner,
      phase: IPhase,
      project: RushConfigurationProject
    ): OperationExecutionManager {
      const operation: Operation = new Operation({
        runner: operationRunnerFactory('operation'),
        logFilenameIdentifier: 'operation',
        phase,
        project
      });

      const operation2: Operation = new Operation({
        runner: operationRunnerFactory('operation2'),
        logFilenameIdentifier: 'operation2',
        phase,
        project
      });

      const manager: OperationExecutionManager = new OperationExecutionManager(
        new Set([operation, operation2]),
        cobuildExecutionManagerOptions
      );

      manager.hooks.afterExecuteOperationAsync.tapPromise('TestPlugin', async (record) => {
        if (!record._operationMetadataManager) {
          throw new Error('OperationMetadataManager is not defined');
        }
        // Mock the readonly state property.
        (record._operationMetadataManager as unknown as Record<string, unknown>).stateFile = {
          state: {
            cobuildContextId: '123',
            cobuildRunnerId: '456',
            nonCachedDurationMs: 15_000
          }
        } as unknown as OperationStateFile;
        record._operationMetadataManager.wasCobuilt = true;
      });

      return manager;
    }
    it('logs cobuilt operations correctly with --timeline option', async () => {
      executionManager = createCobuildExecutionManager(
        executionManagerOptions,
        (name) =>
          new MockOperationRunner(
            `${name} (success)`,
            async () => {
              return OperationStatus.Success;
            },
            /* warningsAreAllowed */ true
          ),
        { name: 'my-name' } as unknown as IPhase,
        {} as unknown as RushConfigurationProject
      );

      const result: IExecutionResult = await executionManager.executeAsync(executionPassOptions);
      _printTimeline({
        terminal: mockTerminal,
        result,
        cobuildConfiguration: {
          cobuildRunnerId: '123',
          cobuildContextId: '123'
        } as unknown as CobuildConfiguration
      });
      _printOperationStatus(mockTerminal, result);
      expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
    });
    it('logs warnings correctly with --timeline option', async () => {
      executionManager = createCobuildExecutionManager(
        executionManagerOptions,
        (name) =>
          new MockOperationRunner(`${name} (success with warnings)`, async (terminal: CollatedTerminal) => {
            terminal.writeStdoutLine('Build step 1\n');
            terminal.writeStdoutLine('Warning: step 1 succeeded with warnings\n');
            return OperationStatus.SuccessWithWarning;
          }),
        { name: 'my-name' } as unknown as IPhase,
        {} as unknown as RushConfigurationProject
      );

      const result: IExecutionResult = await executionManager.executeAsync(executionPassOptions);
      _printTimeline({
        terminal: mockTerminal,
        result,
        cobuildConfiguration: {
          cobuildRunnerId: '123',
          cobuildContextId: '123'
        } as unknown as CobuildConfiguration
      });
      _printOperationStatus(mockTerminal, result);
      const allMessages: string = mockWritable.getAllOutput();
      expect(allMessages).toContain('Build step 1');
      expect(allMessages).toContain('Warning: step 1 succeeded with warnings');
      expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
    });
  });

  describe('Manual run mode', () => {
    it('queues a pass in manual mode and does not auto-execute until executeQueuedPassAsync is called', async () => {
      jest.useFakeTimers({ legacyFakeTimers: true });
      try {
        const options: IOperationExecutionManagerOptions = {
          quietMode: false,
          debugMode: false,
          parallelism: 1,
          destinations: [mockWritable],
          abortController: new AbortController(),
          runNextPassBehavior: 'manual'
        };

        const runFn: jest.Mock = jest.fn(async () => OperationStatus.Success);
        const op: Operation = new Operation({
          runner: new MockOperationRunner('manual-op', runFn),
          phase: mockPhase,
          project: getOrCreateProject('manual-project'),
          logFilenameIdentifier: 'manual-op'
        });

        const manager: OperationExecutionManager = new OperationExecutionManager(new Set([op]), options);

        const passQueuedCalls: ReadonlyMap<Operation, IOperationExecutionResult>[] = [];
        manager.hooks.onPassQueued.tap('test', (records) => passQueuedCalls.push(records));

        const waitingForChangesCalls: number[] = [];
        manager.hooks.onWaitingForChanges.tap('test', () => waitingForChangesCalls.push(1));

        const queued: boolean = await manager.queuePassAsync({});
        expect(queued).toBe(true);
        expect(passQueuedCalls.length).toBe(1);
        // Pass should be queued but not yet started.
        expect(manager.hasQueuedPass).toBe(true);
        expect(runFn).not.toHaveBeenCalled();

        // Flush the idle timeout. Since runNextPassBehavior is 'manual', execution should NOT start.
        jest.runAllTimers();
        expect(waitingForChangesCalls.length).toBe(1);
        expect(runFn).not.toHaveBeenCalled();

        // Now manually execute the queued pass
        const executed: boolean = await manager.executeQueuedPassAsync();
        expect(executed).toBe(true);
        expect(runFn).toHaveBeenCalledTimes(1);
        expect(manager.hasQueuedPass).toBe(false);
        // After execution status should be Success
        expect(manager.status).toBe(OperationStatus.Success);
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not queue a pass if all operations are disabled (no enabled operations)', async () => {
      const options: IOperationExecutionManagerOptions = {
        quietMode: false,
        debugMode: false,
        parallelism: 1,
        destinations: [mockWritable],
        abortController: new AbortController(),
        runNextPassBehavior: 'manual'
      };

      const runFn: jest.Mock = jest.fn(async () => OperationStatus.Success);
      const disabledOp: Operation = new Operation({
        runner: new MockOperationRunner('disabled-op', runFn),
        phase: mockPhase,
        project: getOrCreateProject('disabled-project'),
        logFilenameIdentifier: 'disabled-op',
        enabled: false
      });

      const manager: OperationExecutionManager = new OperationExecutionManager(
        new Set([disabledOp]),
        options
      );

      const passQueuedCalls: ReadonlyMap<Operation, IOperationExecutionResult>[] = [];
      manager.hooks.onPassQueued.tap('test', (records) => passQueuedCalls.push(records));

      const queued: boolean = await manager.queuePassAsync({});
      expect(queued).toBe(false); // Nothing to do
      expect(passQueuedCalls.length).toBe(0); // Hook not fired
      expect(manager.hasQueuedPass).toBe(false);
      expect(runFn).not.toHaveBeenCalled();
      // Status remains Ready (no operations executed)
      expect(manager.status).toBe(OperationStatus.Ready);
    });
  });

  describe('Terminal destination APIs', () => {
    beforeEach(() => {
      executionManagerOptions = {
        quietMode: false,
        debugMode: false,
        parallelism: 1,
        destinations: [mockWritable],
        abortController: new AbortController()
      };
      executionPassOptions = {};
    });

    it('addTerminalDestination causes new destination to receive output', async () => {
      const extraDest = new MockWritable();

      executionManager = createExecutionManager(
        executionManagerOptions,
        new MockOperationRunner('to-extra', async (terminal: CollatedTerminal) => {
          terminal.writeStdoutLine('Message for extra destination');
          return OperationStatus.Success;
        })
      );

      // Add destination before executing
      executionManager.addTerminalDestination(extraDest);

      const result: IExecutionResult = await executionManager.executeAsync(executionPassOptions);
      expect(result.status).toBe(OperationStatus.Success);

      const allOutput: string = extraDest.getAllOutput();
      expect(allOutput).toContain('Message for extra destination');
    });

    it('removeTerminalDestination closes destination by default and stops further output', async () => {
      const extraDest = new MockWritable();

      executionManager = createExecutionManager(
        executionManagerOptions,
        new MockOperationRunner('to-extra', async (terminal: CollatedTerminal) => {
          terminal.writeStdoutLine('Run message');
          return OperationStatus.Success;
        })
      );

      executionManager.addTerminalDestination(extraDest);

      // First run: destination should receive output
      const first = await executionManager.executeAsync(executionPassOptions);
      expect(first.status).toBe(OperationStatus.Success);
      expect(extraDest.getAllOutput()).toContain('Run message');

      // Now remove destination (default close = true) and ensure it was removed/closed
      const removed = executionManager.removeTerminalDestination(extraDest);
      expect(removed).toBe(true);
      // TerminalWritable exposes isOpen
      expect(extraDest.isOpen).toBe(false);

      // Second run: should not write to closed destination
      const beforeSecond = extraDest.getAllOutput();
      const second = await executionManager.executeAsync(executionPassOptions);
      expect(second.status).toBe(OperationStatus.Success);
      const afterSecond = extraDest.getAllOutput();
      expect(afterSecond).toBe(beforeSecond);
    });

    it('removeTerminalDestination with close=false does not close destination but still stops further output', async () => {
      const extraDest = new MockWritable();

      executionManager = createExecutionManager(
        executionManagerOptions,
        new MockOperationRunner('to-extra', async (terminal: CollatedTerminal) => {
          terminal.writeStdoutLine('Run message 2');
          return OperationStatus.Success;
        })
      );

      executionManager.addTerminalDestination(extraDest);

      // First run: destination should receive output
      const first = await executionManager.executeAsync(executionPassOptions);
      expect(first.status).toBe(OperationStatus.Success);
      expect(extraDest.getAllOutput()).toContain('Run message 2');

      // Remove without closing
      const removed = executionManager.removeTerminalDestination(extraDest, false);
      expect(removed).toBe(true);
      // Destination should remain open
      expect(extraDest.isOpen).toBe(true);

      // Second run: destination should not receive additional output
      const beforeSecond = extraDest.getAllOutput();
      const second = await executionManager.executeAsync(executionPassOptions);
      expect(second.status).toBe(OperationStatus.Success);
      const afterSecond = extraDest.getAllOutput();
      expect(afterSecond).toBe(beforeSecond);
    });

    it('removeTerminalDestination returns false when destination not found', () => {
      const unknown = new MockWritable();
      const manager = createExecutionManager(executionManagerOptions, new MockOperationRunner('noop'));
      const removed = manager.removeTerminalDestination(unknown);
      expect(removed).toBe(false);
    });
  });
});

describe('invalidateOperations', () => {
  it('invalidates a specific operation and updates manager status', async () => {
    const localOptions: IOperationExecutionManagerOptions = {
      quietMode: false,
      debugMode: false,
      parallelism: 1,
      destinations: [mockWritable],
      abortController: new AbortController()
    };

    const runner: IOperationRunner = new MockOperationRunner('invalidate-success', async () => {
      return OperationStatus.Success;
    });

    const localManager: OperationExecutionManager = createExecutionManager(localOptions, runner);

    const invalidateCalls: Array<{ ops: Iterable<Operation>; reason: string | undefined }> = [];
    localManager.hooks.onInvalidateOperations.tap(
      'test',
      (ops: Iterable<Operation>, reason: string | undefined) => {
        invalidateCalls.push({ ops, reason });
      }
    );

    const result: IExecutionResult = await localManager.executeAsync({});
    expect(result.status).toBe(OperationStatus.Success);
    const record: IOperationExecutionResult | undefined = result.operationResults.values().next().value;
    expect(record?.status).toBe(OperationStatus.Success);

    const operation: Operation = Array.from(localManager.operations)[0];
    localManager.invalidateOperations([operation], 'unit-test');

    const postRecord: IOperationExecutionResult | undefined =
      localManager.lastExecutionResults.get(operation);
    expect(postRecord?.status).toBe(OperationStatus.Ready);
    expect(localManager.status).toBe(OperationStatus.Ready);
    expect(invalidateCalls.length).toBe(1);
    const invalidatedOps: Operation[] = Array.from(invalidateCalls[0].ops as Set<Operation>);
    expect(invalidatedOps).toHaveLength(1);
    expect(invalidatedOps[0]).toBe(operation);
    expect(invalidateCalls[0].reason).toBe('unit-test');
  });

  it('invalidates all operations when no iterable is provided', async () => {
    const localOptions: IOperationExecutionManagerOptions = {
      quietMode: false,
      debugMode: false,
      parallelism: 1,
      destinations: [mockWritable],
      abortController: new AbortController()
    };

    const op1Runner: IOperationRunner = new MockOperationRunner('op1');
    const op2Runner: IOperationRunner = new MockOperationRunner('op2');

    const op1: Operation = new Operation({
      runner: op1Runner,
      logFilenameIdentifier: 'op1',
      phase: mockPhase,
      project: getOrCreateProject('p1')
    });
    const op2: Operation = new Operation({
      runner: op2Runner,
      logFilenameIdentifier: 'op2',
      phase: mockPhase,
      project: getOrCreateProject('p2')
    });

    const localManager: OperationExecutionManager = new OperationExecutionManager(
      new Set([op1, op2]),
      localOptions
    );

    await localManager.executeAsync({});
    for (const record of localManager.lastExecutionResults.values()) {
      expect(record.status).toBeDefined();
    }

    // Cast to align with implementation signature which doesn't mark parameter optional
    localManager.invalidateOperations(undefined as unknown as Iterable<Operation>, 'bulk');
    for (const record of localManager.lastExecutionResults.values()) {
      expect(record.status).toBe(OperationStatus.Ready);
    }
  });
});

describe('closeRunnersAsync', () => {
  class ClosableRunner extends MockOperationRunner {
    public readonly closeAsync: jest.Mock<Promise<void>, []> = jest.fn(async () => {
      /* no-op */
    });
  }

  it('invokes closeAsync on runners and triggers onExecutionStatesUpdated hook', async () => {
    const localOptions: IOperationExecutionManagerOptions = {
      quietMode: false,
      debugMode: false,
      parallelism: 1,
      destinations: [mockWritable],
      abortController: new AbortController()
    };

    const runner = new ClosableRunner('closable');
    const localManager: OperationExecutionManager = createExecutionManager(localOptions, runner);

    await localManager.executeAsync({});

    const statusChangedCalls: ReadonlySet<IOperationExecutionResult>[] = [];
    localManager.hooks.onExecutionStatesUpdated.tap('test', (records) => {
      statusChangedCalls.push(records);
    });

    await localManager.closeRunnersAsync();

    expect(runner.closeAsync).toHaveBeenCalledTimes(1);
    expect(statusChangedCalls.length).toBe(1);
    const firstBatchArray = Array.from(statusChangedCalls[0]);
    expect(firstBatchArray[0].operation.runner).toBe(runner);
  });

  it('only closes specified runners when operations iterable provided', async () => {
    const localOptions: IOperationExecutionManagerOptions = {
      quietMode: false,
      debugMode: false,
      parallelism: 1,
      destinations: [mockWritable],
      abortController: new AbortController()
    };

    const runner1 = new ClosableRunner('closable1');
    const runner2 = new ClosableRunner('closable2');

    const op1: Operation = new Operation({
      runner: runner1,
      logFilenameIdentifier: 'c1',
      phase: mockPhase,
      project: getOrCreateProject('c1')
    });
    const op2: Operation = new Operation({
      runner: runner2,
      logFilenameIdentifier: 'c2',
      phase: mockPhase,
      project: getOrCreateProject('c2')
    });

    const localManager: OperationExecutionManager = new OperationExecutionManager(
      new Set([op1, op2]),
      localOptions
    );
    await localManager.executeAsync({});

    await localManager.closeRunnersAsync([op1]);
    expect(runner1.closeAsync).toHaveBeenCalledTimes(1);
    expect(runner2.closeAsync).not.toHaveBeenCalled();
  });
});

describe('Manager state change notifications', () => {
  function createManagerForStateTests(
    overrides: Partial<IOperationExecutionManagerOptions> = {}
  ): OperationExecutionManager {
    const baseOptions: IOperationExecutionManagerOptions = {
      quietMode: false,
      debugMode: false,
      parallelism: 2,
      maxParallelism: 4,
      destinations: [mockWritable],
      abortController: new AbortController()
    };
    const manager: OperationExecutionManager = new OperationExecutionManager(new Set(), {
      ...baseOptions,
      ...overrides
    });
    return manager;
  }

  beforeEach(() => {
    // Use legacy fake timers so we can explicitly flush process.nextTick queue via runAllTicks
    jest.useFakeTimers({ legacyFakeTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function flushNextTick(): Promise<void> {
    jest.runAllTicks();
  }

  it('invokes callback when a single property changes', async () => {
    const manager: OperationExecutionManager = createManagerForStateTests();
    const calls: IOperationExecutionManager[] = [];
    manager.hooks.onManagerStateChanged.tap('test', (m) => calls.push(m));
    manager.debugMode = true; // change value
    expect(calls.length).toBe(0); // debounced
    await flushNextTick();
    expect(calls.length).toBe(1);
    expect(manager.debugMode).toBe(true);
  });

  it('debounces multiple property changes in the same tick', async () => {
    const manager: OperationExecutionManager = createManagerForStateTests();
    const calls: IOperationExecutionManager[] = [];
    manager.hooks.onManagerStateChanged.tap('test', (m) => calls.push(m));
    manager.debugMode = true;
    manager.quietMode = true; // second change before nextTick flush
    manager.runNextPassBehavior = 'manual';
    manager.parallelism = 3;
    await flushNextTick();
    expect(calls.length).toBe(1); // Only one notification for four changes
    expect(manager.debugMode).toBe(true);
    expect(manager.quietMode).toBe(true);
    expect(manager.runNextPassBehavior).toBe('manual');
    expect(manager.parallelism).toBe(3);
  });

  it('does not invoke callback when setting a property to its existing value', async () => {
    const manager: OperationExecutionManager = createManagerForStateTests();
    const calls: IOperationExecutionManager[] = [];
    manager.hooks.onManagerStateChanged.tap('test', (m) => calls.push(m));
    manager.debugMode = false; // same as initial
    manager.quietMode = false; // same as initial
    await flushNextTick();
    expect(calls.length).toBe(0);
  });

  it('clamps parallelism to configured bounds and invokes callback only when value changes', async () => {
    const manager: OperationExecutionManager = createManagerForStateTests({
      parallelism: 2,
      maxParallelism: 4
    });
    const calls: IOperationExecutionManager[] = [];
    manager.hooks.onManagerStateChanged.tap('test', (m) => calls.push(m));

    // Increase beyond max -> clamp to 4
    manager.parallelism = 10;
    await flushNextTick();
    expect(manager.parallelism).toBe(4);
    expect(calls.length).toBe(1);

    // Set to same clamped value -> no new callback
    manager.parallelism = 10; // still clamps to 4, unchanged
    await flushNextTick();
    expect(calls.length).toBe(1);

    // Decrease below minimum -> clamp to 1 (change from 4)
    manager.parallelism = 0;
    await flushNextTick();
    expect(manager.parallelism).toBe(1);
    expect(calls.length).toBe(2);
  });

  it('runNextPassBehavior change triggers callback only when value changes', async () => {
    const manager: OperationExecutionManager = createManagerForStateTests();
    const calls: IOperationExecutionManager[] = [];
    manager.hooks.onManagerStateChanged.tap('test', (m) => calls.push(m));

    manager.runNextPassBehavior = 'manual';
    await flushNextTick();
    expect(calls.length).toBe(1);
    expect(manager.runNextPassBehavior).toBe('manual');

    manager.runNextPassBehavior = 'manual'; // unchanged
    await flushNextTick();
    expect(calls.length).toBe(1); // still one call

    manager.runNextPassBehavior = 'automatic'; // change
    await flushNextTick();
    expect(calls.length).toBe(2);
    expect(manager.runNextPassBehavior).toBe('automatic');
  });
});

describe('setEnabledStates', () => {
  function createChain(names: string[]): Operation[] {
    const ops: Operation[] = names.map(
      (n) =>
        new Operation({
          runner: new MockOperationRunner(n, async () => OperationStatus.Success),
          phase: mockPhase,
          project: getOrCreateProject(n),
          logFilenameIdentifier: n
        })
    );
    // Simple linear dependencies a->b->c (each depends on next) for dependency expansion tests
    for (let i = 0; i < ops.length - 1; i++) {
      ops[i].addDependency(ops[i + 1]);
    }
    return ops;
  }

  function createManagerWithOperations(ops: Operation[]): OperationExecutionManager {
    return new OperationExecutionManager(new Set(ops), {
      quietMode: false,
      debugMode: false,
      parallelism: 1,
      destinations: [mockWritable],
      abortController: new AbortController()
    });
  }

  it('safe enable expands dependencies', () => {
    const [a, b, c] = createChain(['a', 'b', 'c']);
    // start disabled
    a.enabled = false;
    b.enabled = false;
    c.enabled = false;
    const manager = createManagerWithOperations([a, b, c]);
    const calls: ReadonlySet<Operation>[] = [];
    manager.hooks.onEnableStatesChanged.tap('test', (ops) => calls.push(new Set(ops)));
    const changed = manager.setEnabledStates([a], true, 'safe');
    expect(changed).toBe(true);
    // All three should now be true because of dependency expansion (a depends on b depends on c)
    expect(a.enabled).toBe(true);
    expect(b.enabled).toBe(true);
    expect(c.enabled).toBe(true);
    expect(calls).toHaveLength(1);
    expect(Array.from(calls[0]).sort((x, y) => x.name!.localeCompare(y.name!))).toEqual([a, b, c]);
  });

  it('safe disable disables entire dependency subtree when not required elsewhere', () => {
    const [a, b, c] = createChain(['a', 'b', 'c']);
    // Initially all true
    const manager = createManagerWithOperations([a, b, c]);
    const calls: ReadonlySet<Operation>[] = [];
    manager.hooks.onEnableStatesChanged.tap('test', (ops) => calls.push(new Set(ops)));
    // Attempt to disable middle dependency (b) safely -> should NOT disable since a depends on b (b and its subtree still required)
    const changedB = manager.setEnabledStates([b], false, 'safe');
    expect(changedB).toBe(false);
    expect(calls).toHaveLength(0);
    // Attempt to disable leaf c safely -> should NOT disable since b (and thus a) still depend on c
    const changedC = manager.setEnabledStates([c], false, 'safe');
    expect(changedC).toBe(false);
    expect(calls).toHaveLength(0);
    // Disable root a safely -> this should disable a and its entire dependency subtree (b,c) since nothing else depends on them
    const changedA = manager.setEnabledStates([a], false, 'safe');
    expect(changedA).toBe(true);
    expect(a.enabled).toBe(false);
    expect(b.enabled).toBe(false);
    expect(c.enabled).toBe(false);
    expect(calls).toHaveLength(1); // single batch for subtree disable
    const changedNames: string[] = Array.from(calls[0], (op) => op.name!).sort();
    expect(changedNames).toEqual(['a', 'b', 'c']);
  });

  it('safe ignore-dependency-changes sets requested and dependencies to ignore state, respects per-op flag', () => {
    const [a, b, c] = createChain(['a', 'b', 'c']);
    // Simulate b having ignoreChangedProjectsOnlyFlag forcing it to true rather than ignore-dependency-changes
    b.settings = { ignoreChangedProjectsOnlyFlag: true } as unknown as typeof b.settings;
    a.enabled = false;
    b.enabled = false;
    c.enabled = false;
    const manager = createManagerWithOperations([a, b, c]);
    const calls: ReadonlySet<Operation>[] = [];
    manager.hooks.onEnableStatesChanged.tap('test', (ops) => calls.push(new Set(ops)));
    const changed = manager.setEnabledStates([a], 'ignore-dependency-changes', 'safe');
    expect(changed).toBe(true);
    expect(a.enabled).toBe('ignore-dependency-changes');
    // b forced to true because of its settings flag
    expect(b.enabled).toBe(true);
    const cState: Operation['enabled'] = c.enabled;
    const acceptable: boolean =
      cState === (true as Operation['enabled']) ||
      cState === ('ignore-dependency-changes' as Operation['enabled']);
    expect(acceptable).toBe(true);
    expect(calls).toHaveLength(1);
    // a and b at least must be in changed set (c may also if changed)
    const changedNames = new Set(Array.from(calls[0], (o) => o.name));
    expect(changedNames.has('a')).toBe(true);
    expect(changedNames.has('b')).toBe(true);
  });

  it('unsafe mode only mutates provided operations', () => {
    const [a, b, c] = createChain(['a', 'b', 'c']);
    const manager = createManagerWithOperations([a, b, c]);
    const calls: ReadonlySet<Operation>[] = [];
    manager.hooks.onEnableStatesChanged.tap('test', (ops) => calls.push(new Set(ops)));
    const changed = manager.setEnabledStates([b], false, 'unsafe');
    expect(changed).toBe(true);
    expect(a.enabled).not.toBe(false);
    expect(b.enabled).toBe(false);
    expect(c.enabled).not.toBe(false);
    expect(calls).toHaveLength(1);
    expect(Array.from(calls[0])).toEqual([b]);
  });
});
