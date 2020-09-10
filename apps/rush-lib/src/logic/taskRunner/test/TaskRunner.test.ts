// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The TaskRunner prints "x.xx seconds" in TestRunner.test.ts.snap; ensure that the Stopwatch timing is deterministic
jest.mock('../../../utilities/Utilities');

import * as colors from 'colors';
import { EOL } from 'os';
import { CollatedTerminal } from '@rushstack/stream-collator';
import { MockWritable } from '@rushstack/terminal';

import { TaskRunner, ITaskRunnerOptions } from '../TaskRunner';
import { TaskStatus } from '../TaskStatus';
import { Task } from '../Task';
import { Utilities } from '../../../utilities/Utilities';
import { BaseBuilder } from '../BaseBuilder';
import { MockBuilder } from './MockBuilder';

const mockGetTimeInMs: jest.Mock = jest.fn();
Utilities.getTimeInMs = mockGetTimeInMs;

let mockTimeInMs: number = 0;
mockGetTimeInMs.mockImplementation(() => {
  console.log('CALLED mockGetTimeInMs');
  mockTimeInMs += 100;
  return mockTimeInMs;
});

const mockWritable: MockWritable = new MockWritable();

function createTaskRunner(taskRunnerOptions: ITaskRunnerOptions, builder: BaseBuilder): TaskRunner {
  const task: Task = new Task();
  task.dependencies = new Set<Task>();
  task.dependents = new Set<Task>();
  task.status = TaskStatus.Ready;
  task.builder = builder;

  return new TaskRunner([task], taskRunnerOptions);
}

describe('TaskRunner', () => {
  let taskRunner: TaskRunner;
  let taskRunnerOptions: ITaskRunnerOptions;

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
          new TaskRunner([], {
            quietMode: false,
            parallelism: 'tequila',
            changedProjectsOnly: false,
            destination: mockWritable,
            allowWarningsInSuccessfulBuild: false
          })
      ).toThrowErrorMatchingSnapshot();
    });
  });

  describe('Error logging', () => {
    beforeEach(() => {
      taskRunnerOptions = {
        quietMode: false,
        parallelism: '1',
        changedProjectsOnly: false,
        destination: mockWritable,
        allowWarningsInSuccessfulBuild: false
      };
    });

    const EXPECTED_FAIL: string = 'Promise returned by execute() resolved but was expected to fail';

    it('printedStderrAfterError', () => {
      taskRunner = createTaskRunner(
        taskRunnerOptions,
        new MockBuilder('stdout+stderr', async (terminal: CollatedTerminal) => {
          terminal.writeStdoutLine('Build step 1' + EOL);
          terminal.writeStderrLine('Error: step 1 failed' + EOL);
          return TaskStatus.Failure;
        })
      );

      return taskRunner
        .executeAsync()
        .then(() => fail(EXPECTED_FAIL))
        .catch((err) => {
          expect(err.message).toMatchSnapshot();
          const allMessages: string = mockWritable.getAllOutput();
          expect(allMessages).toContain('Error: step 1 failed');
          expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
        });
    });

    it('printedStdoutAfterErrorWithEmptyStderr', () => {
      taskRunner = createTaskRunner(
        taskRunnerOptions,
        new MockBuilder('stdout only', async (terminal: CollatedTerminal) => {
          terminal.writeStdoutLine('Build step 1' + EOL);
          terminal.writeStdoutLine('Error: step 1 failed' + EOL);
          return TaskStatus.Failure;
        })
      );

      return taskRunner
        .executeAsync()
        .then(() => fail(EXPECTED_FAIL))
        .catch((err) => {
          expect(err.message).toMatchSnapshot();
          const allOutput: string = mockWritable.getAllOutput();
          expect(allOutput).toMatch(/Build step 1/);
          expect(allOutput).toMatch(/Error: step 1 failed/);
          expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
        });
    });
  });

  describe('Warning logging', () => {
    describe('Fail on warning', () => {
      beforeEach(() => {
        taskRunnerOptions = {
          quietMode: false,
          parallelism: '1',
          changedProjectsOnly: false,
          destination: mockWritable,
          allowWarningsInSuccessfulBuild: false
        };
      });

      it('Logs warnings correctly', () => {
        taskRunner = createTaskRunner(
          taskRunnerOptions,
          new MockBuilder('success with warnings (failure)', async (terminal: CollatedTerminal) => {
            terminal.writeStdoutLine('Build step 1' + EOL);
            terminal.writeStdoutLine('Warning: step 1 succeeded with warnings' + EOL);
            return TaskStatus.SuccessWithWarning;
          })
        );

        return taskRunner
          .executeAsync()
          .then(() => fail('Promise returned by execute() resolved but was expected to fail'))
          .catch((err) => {
            expect(err.message).toMatchSnapshot();
            const allMessages: string = mockWritable.getAllOutput();
            expect(allMessages).toContain('Build step 1');
            expect(allMessages).toContain('step 1 succeeded with warnings');
            expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
          });
      });
    });

    describe('Success on warning', () => {
      beforeEach(() => {
        taskRunnerOptions = {
          quietMode: false,
          parallelism: '1',
          changedProjectsOnly: false,
          destination: mockWritable,
          allowWarningsInSuccessfulBuild: true
        };
      });

      it('Logs warnings correctly', () => {
        taskRunner = createTaskRunner(
          taskRunnerOptions,
          new MockBuilder('success with warnings (success)', async (terminal: CollatedTerminal) => {
            terminal.writeStdoutLine('Build step 1' + EOL);
            terminal.writeStdoutLine('Warning: step 1 succeeded with warnings' + EOL);
            return TaskStatus.SuccessWithWarning;
          })
        );

        return taskRunner
          .executeAsync()
          .then(() => {
            const allMessages: string = mockWritable.getAllOutput();
            expect(allMessages).toContain('Build step 1');
            expect(allMessages).toContain('Warning: step 1 succeeded with warnings');
            expect(mockWritable.getFormattedChunks()).toMatchSnapshot();
          })
          .catch((err) => fail('Promise returned by execute() rejected but was expected to resolve'));
      });
    });
  });
});
