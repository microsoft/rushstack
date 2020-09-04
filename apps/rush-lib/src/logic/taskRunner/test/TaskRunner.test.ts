// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The TaskRunner prints "x.xx seconds" in TestRunner.test.ts.snap; ensure that the Stopwatch timing is deterministic
jest.mock('../../../utilities/Utilities');

import { EOL } from 'os';
import { ICollatedChunk, CollatedTerminal } from '@rushstack/stream-collator';
import { AnsiEscape } from '@rushstack/node-core-library';

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

class MockStream {
  public readonly chunks: ICollatedChunk[] = [];
  public reset(): void {
    this.chunks.length = 0;
  }
  public writeToStream = (chunk: ICollatedChunk): void => {
    const encodedText: string = AnsiEscape.formatForTests(chunk.text, { encodeNewlines: true });
    this.chunks.push({
      text: encodedText,
      stream: chunk.stream
    });
  };
  public getAllOutput(): string {
    return this.chunks.map((x) => x.text).join('');
  }
  public checkSnapshot(): void {
    expect(this.chunks).toMatchSnapshot();
  }
}
const mockStream: MockStream = new MockStream();

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

  beforeEach(() => {
    mockStream.reset();
  });

  describe('Constructor', () => {
    it('throwsErrorOnInvalidParallelism', () => {
      expect(
        () =>
          new TaskRunner([], {
            quietMode: false,
            parallelism: 'tequila',
            changedProjectsOnly: false,
            writeToStream: mockStream.writeToStream,
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
        writeToStream: mockStream.writeToStream,
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
          const allMessages: string = mockStream.getAllOutput();
          expect(allMessages).toContain('Error: step 1 failed');
          mockStream.checkSnapshot();
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
          expect(mockStream.getAllOutput()).toMatch(/Build step 1.*Error: step 1 failed/);
          mockStream.checkSnapshot();
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
          writeToStream: mockStream.writeToStream,
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
            const allMessages: string = mockStream.getAllOutput();
            expect(allMessages).toContain('Build step 1');
            expect(allMessages).toContain('step 1 succeeded with warnings');
            mockStream.checkSnapshot();
          });
      });
    });

    describe('Success on warning', () => {
      beforeEach(() => {
        taskRunnerOptions = {
          quietMode: false,
          parallelism: '1',
          changedProjectsOnly: false,
          writeToStream: mockStream.writeToStream,
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
            const allMessages: string = mockStream.getAllOutput();
            expect(allMessages).toContain('Build step 1');
            expect(allMessages).toContain('Warning: step 1 succeeded with warnings');
            mockStream.checkSnapshot();
          })
          .catch((err) => fail('Promise returned by execute() rejected but was expected to resolve'));
      });
    });
  });
});
