// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The TaskExecutionManager prints "x.xx seconds" in TestRunner.test.ts.snap; ensure that the Stopwatch timing is deterministic
jest.mock('../../../utilities/Utilities');
jest.mock('../OperationStateFile');

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

import { Terminal } from '@rushstack/terminal';
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
import type { IOperationRunner } from '../IOperationRunner';
import { MockOperationRunner } from './MockOperationRunner';
import type { IExecutionResult, IOperationExecutionResult } from '../IOperationExecutionResult';
import { CollatedTerminalProvider } from '../../../utilities/CollatedTerminalProvider';
import type { CobuildConfiguration } from '../../../api/CobuildConfiguration';
import type { OperationStateFile } from '../OperationStateFile';

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
        destination: mockWritable
      };
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

      const abortController = new AbortController();
      const result: IExecutionResult = await executionManager.executeAsync(abortController);
      _printOperationStatus(mockTerminal, result);
      expect(result.status).toEqual(OperationStatus.Failure);
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

      const abortController = new AbortController();
      const result: IExecutionResult = await executionManager.executeAsync(abortController);
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
          destination: mockWritable
        }
      );

      const abortController = new AbortController();
      abortController.abort();

      const result = await manager.executeAsync(abortController);
      expect(result.status).toEqual(OperationStatus.Aborted);
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
          destination: mockWritable
        }
      );

      const abortController = new AbortController();
      const result = await manager.executeAsync(abortController);
      expect(result.status).toEqual(OperationStatus.Failure);
      expect(blockedRunFn).not.toHaveBeenCalled();
      expect(result.operationResults.size).toEqual(2);
      expect(result.operationResults.get(failingOperation)?.status).toEqual(OperationStatus.Failure);
      expect(result.operationResults.get(blockedOperation)?.status).toEqual(OperationStatus.Blocked);
    });
  });

  describe('Warning logging', () => {
    describe('Fail on warning', () => {
      beforeEach(() => {
        executionManagerOptions = {
          quietMode: false,
          debugMode: false,
          parallelism: 1,
          destination: mockWritable
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

        const abortController = new AbortController();
        const result: IExecutionResult = await executionManager.executeAsync(abortController);
        _printOperationStatus(mockTerminal, result);
        expect(result.status).toEqual(OperationStatus.SuccessWithWarning);
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
          destination: mockWritable
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

        const abortController = new AbortController();
        const result: IExecutionResult = await executionManager.executeAsync(abortController);
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

        const abortController = new AbortController();
        const result: IExecutionResult = await executionManager.executeAsync(abortController);
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

      return new OperationExecutionManager(new Set([operation, operation2]), {
        afterExecuteOperationAsync: async (record) => {
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
        },
        ...cobuildExecutionManagerOptions
      });
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

      const abortController = new AbortController();
      const result: IExecutionResult = await executionManager.executeAsync(abortController);
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

      const abortController = new AbortController();
      const result: IExecutionResult = await executionManager.executeAsync(abortController);
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
});
