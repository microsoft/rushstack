// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The TaskExecutionManager prints "x.xx seconds" in TestRunner.test.ts.snap; ensure that the Stopwatch timing is deterministic
jest.mock('../../../utilities/Utilities');

import colors from 'colors/safe';
import { EOL } from 'os';
import { CollatedTerminal } from '@rushstack/stream-collator';
import { MockWritable } from '@rushstack/terminal';

import { TaskExecutionManager, ITaskExecutionManagerOptions } from '../TaskExecutionManager';
import { TaskStatus } from '../TaskStatus';
import { Task } from '../Task';
import { Utilities } from '../../../utilities/Utilities';
import { BaseTaskRunner } from '../BaseTaskRunner';
import { MockTaskRunner } from './MockTaskRunner';

const mockGetTimeInMs: jest.Mock = jest.fn();
Utilities.getTimeInMs = mockGetTimeInMs;

let mockTimeInMs: number = 0;
mockGetTimeInMs.mockImplementation(() => {
  console.log('CALLED mockGetTimeInMs');
  mockTimeInMs += 100;
  return mockTimeInMs;
});

const mockWritable: MockWritable = new MockWritable();

function createTaskExecutionManager(
  taskExecutionManagerOptions: ITaskExecutionManagerOptions,
  taskRunner: BaseTaskRunner
): TaskExecutionManager {
  const task: Task = new Task(taskRunner, TaskStatus.Ready);

  return new TaskExecutionManager(new Set([task]), taskExecutionManagerOptions);
}

const EXPECTED_FAIL: string = `Promise returned by ${TaskExecutionManager.prototype.executeAsync.name}() resolved but was expected to fail`;

describe(TaskExecutionManager.name, () => {
  let taskExecutionManager: TaskExecutionManager;
  let taskExecutionManagerOptions: ITaskExecutionManagerOptions;

  let initialColorsEnabled: boolean;

  beforeAll(() => {
    initialColorsEnabled = colors.enabled;
    colors.enable();
  });

  afterAll(() => {
    if (!initialColorsEnabled) {
      colors.disable();
    }
  });

  beforeEach(() => {
    mockWritable.reset();
  });

  describe('Constructor', () => {
    it('throwsErrorOnInvalidParallelism', () => {
      expect(
        () =>
          new TaskExecutionManager(new Set(), {
            quietMode: false,
            debugMode: false,
            parallelism: 'tequila',
            changedProjectsOnly: false,
            destination: mockWritable,
            repoCommandLineConfiguration: undefined!
          })
      ).toThrowErrorMatchingSnapshot();
    });
  });

  describe('Error logging', () => {
    beforeEach(() => {
      taskExecutionManagerOptions = {
        quietMode: false,
        debugMode: false,
        parallelism: '1',
        changedProjectsOnly: false,
        destination: mockWritable,
        repoCommandLineConfiguration: undefined!
      };
    });

    it('printedStderrAfterError', async () => {
      taskExecutionManager = createTaskExecutionManager(
        taskExecutionManagerOptions,
        new MockTaskRunner('stdout+stderr', async (terminal: CollatedTerminal) => {
          terminal.writeStdoutLine('Build step 1' + EOL);
          terminal.writeStderrLine('Error: step 1 failed' + EOL);
          return TaskStatus.Failure;
        })
      );

      try {
        await taskExecutionManager.executeAsync();
        fail(EXPECTED_FAIL);
      } catch (err) {
        expect((err as Error).message).toMatchSnapshot();
        const allMessages: string = mockWritable.getAllOutput();
        expect(allMessages).toContain('Error: step 1 failed');
        expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
      }
    });

    it('printedStdoutAfterErrorWithEmptyStderr', async () => {
      taskExecutionManager = createTaskExecutionManager(
        taskExecutionManagerOptions,
        new MockTaskRunner('stdout only', async (terminal: CollatedTerminal) => {
          terminal.writeStdoutLine('Build step 1' + EOL);
          terminal.writeStdoutLine('Error: step 1 failed' + EOL);
          return TaskStatus.Failure;
        })
      );

      try {
        await taskExecutionManager.executeAsync();
        fail(EXPECTED_FAIL);
      } catch (err) {
        expect((err as Error).message).toMatchSnapshot();
        const allOutput: string = mockWritable.getAllOutput();
        expect(allOutput).toMatch(/Build step 1/);
        expect(allOutput).toMatch(/Error: step 1 failed/);
        expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
      }
    });
  });

  describe('Warning logging', () => {
    describe('Fail on warning', () => {
      beforeEach(() => {
        taskExecutionManagerOptions = {
          quietMode: false,
          debugMode: false,
          parallelism: '1',
          changedProjectsOnly: false,
          destination: mockWritable,
          repoCommandLineConfiguration: undefined!
        };
      });

      it('Logs warnings correctly', async () => {
        taskExecutionManager = createTaskExecutionManager(
          taskExecutionManagerOptions,
          new MockTaskRunner('success with warnings (failure)', async (terminal: CollatedTerminal) => {
            terminal.writeStdoutLine('Build step 1' + EOL);
            terminal.writeStdoutLine('Warning: step 1 succeeded with warnings' + EOL);
            return TaskStatus.SuccessWithWarning;
          })
        );

        try {
          await taskExecutionManager.executeAsync();
          fail(EXPECTED_FAIL);
        } catch (err) {
          expect((err as Error).message).toMatchSnapshot();
          const allMessages: string = mockWritable.getAllOutput();
          expect(allMessages).toContain('Build step 1');
          expect(allMessages).toContain('step 1 succeeded with warnings');
          expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
        }
      });
    });

    describe('Success on warning', () => {
      beforeEach(() => {
        taskExecutionManagerOptions = {
          quietMode: false,
          debugMode: false,
          parallelism: '1',
          changedProjectsOnly: false,
          destination: mockWritable,
          repoCommandLineConfiguration: undefined!
        };
      });

      it('Logs warnings correctly', async () => {
        taskExecutionManager = createTaskExecutionManager(
          taskExecutionManagerOptions,
          new MockTaskRunner(
            'success with warnings (success)',
            async (terminal: CollatedTerminal) => {
              terminal.writeStdoutLine('Build step 1' + EOL);
              terminal.writeStdoutLine('Warning: step 1 succeeded with warnings' + EOL);
              return TaskStatus.SuccessWithWarning;
            },
            /* warningsAreAllowed */ true
          )
        );

        await taskExecutionManager.executeAsync();
        const allMessages: string = mockWritable.getAllOutput();
        expect(allMessages).toContain('Build step 1');
        expect(allMessages).toContain('Warning: step 1 succeeded with warnings');
        expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
      });
    });
  });
});
