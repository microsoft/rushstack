import { EOL } from 'os';
import { TaskRunner, ITaskRunnerOptions } from '../TaskRunner';
import { ITaskWriter } from '@rushstack/stream-collator';
import { TaskStatus } from '../TaskStatus';
import { ITaskDefinition, ITask } from '../ITask';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/node-core-library';
import { Utilities } from '../../../utilities/Utilities';

// The TaskRunner prints "x.xx seconds" in TestRunner.test.ts.snap; ensure that the Stopwatch timing is deterministic
jest.mock('../../../utilities/Utilities');
const mockGetTimeInMs: jest.Mock = jest.fn();
Utilities.getTimeInMs = mockGetTimeInMs;

let mockTimeInMs: number = 0;
mockGetTimeInMs.mockImplementation(() => {
  console.log('CALLED mockGetTimeInMs');
  mockTimeInMs += 100;
  return mockTimeInMs;
});

function createTaskRunner(
  taskRunnerOptions: ITaskRunnerOptions,
  taskDefinition: ITaskDefinition
): TaskRunner {
  const task: ITask = taskDefinition as ITask;
  task.dependencies = new Set<ITask>();
  task.dependents = new Set<ITask>();
  task.status = TaskStatus.Ready;

  return new TaskRunner([task], taskRunnerOptions);
}

function checkConsoleOutput(terminalProvider: StringBufferTerminalProvider): void {
  expect(terminalProvider.getOutput()).toMatchSnapshot();
  expect(terminalProvider.getVerbose()).toMatchSnapshot();
  expect(terminalProvider.getWarningOutput()).toMatchSnapshot();
  expect(terminalProvider.getErrorOutput()).toMatchSnapshot();
}

describe('TaskRunner', () => {
  let terminalProvider: StringBufferTerminalProvider;
  let terminal: Terminal;
  let taskRunner: TaskRunner;
  let taskRunnerOptions: ITaskRunnerOptions;

  beforeEach(() => {
    terminalProvider = new StringBufferTerminalProvider(true);
    terminal = new Terminal(terminalProvider);
  });

  describe('Constructor', () => {
    it('throwsErrorOnInvalidParallelism', () => {
      expect(
        () =>
          new TaskRunner([], {
            quietMode: false,
            parallelism: 'tequila',
            changedProjectsOnly: false,
            terminal,
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
        terminal,
        allowWarningsInSuccessfulBuild: false
      };
    });

    const EXPECTED_FAIL: string = 'Promise returned by execute() resolved but was expected to fail';

    it('printedStderrAfterError', () => {
      taskRunner = createTaskRunner(taskRunnerOptions, {
        name: 'stdout+stderr',
        isIncrementalBuildAllowed: false,
        execute: (writer: ITaskWriter) => {
          writer.write('Build step 1' + EOL);
          writer.writeError('Error: step 1 failed' + EOL);
          return Promise.resolve(TaskStatus.Failure);
        },
        hadEmptyScript: false
      });

      return taskRunner
        .execute()
        .then(() => fail(EXPECTED_FAIL))
        .catch((err) => {
          expect(err.message).toMatchSnapshot();
          const allMessages: string = terminalProvider.getOutput();
          expect(allMessages).not.toContain('Build step 1');
          expect(allMessages).toContain('Error: step 1 failed');
          checkConsoleOutput(terminalProvider);
        });
    });

    it('printedStdoutAfterErrorWithEmptyStderr', () => {
      taskRunner = createTaskRunner(taskRunnerOptions, {
        name: 'stdout only',
        isIncrementalBuildAllowed: false,
        execute: (writer: ITaskWriter) => {
          writer.write('Build step 1' + EOL);
          writer.write('Error: step 1 failed' + EOL);
          return Promise.resolve(TaskStatus.Failure);
        },
        hadEmptyScript: false
      });

      return taskRunner
        .execute()
        .then(() => fail(EXPECTED_FAIL))
        .catch((err) => {
          expect(err.message).toMatchSnapshot();
          expect(terminalProvider.getOutput()).toMatch(/Build step 1.*Error: step 1 failed/);
          checkConsoleOutput(terminalProvider);
        });
    });

    it('printedAbridgedStdoutAfterErrorWithEmptyStderr', () => {
      taskRunner = createTaskRunner(taskRunnerOptions, {
        name: 'large stdout only',
        isIncrementalBuildAllowed: false,
        execute: (writer: ITaskWriter) => {
          writer.write(`Building units...${EOL}`);
          for (let i: number = 1; i <= 50; i++) {
            writer.write(` - unit #${i};${EOL}`);
          }
          return Promise.resolve(TaskStatus.Failure);
        },
        hadEmptyScript: false
      });

      return taskRunner
        .execute()
        .then(() => fail(EXPECTED_FAIL))
        .catch((err) => {
          expect(err.message).toMatchSnapshot();
          expect(terminalProvider.getOutput()).toMatch(
            /Building units.* - unit #1;.* - unit #3;.*lines omitted.* - unit #48;.* - unit #50;/
          );
          checkConsoleOutput(terminalProvider);
        });
    });

    it('preservedLeadingBlanksButTrimmedTrailingBlanks', () => {
      taskRunner = createTaskRunner(taskRunnerOptions, {
        name: 'large stderr with leading and trailing blanks',
        isIncrementalBuildAllowed: false,
        execute: (writer: ITaskWriter) => {
          writer.writeError(`List of errors:  ${EOL}`);
          for (let i: number = 1; i <= 50; i++) {
            writer.writeError(` - error #${i};  ${EOL}`);
          }
          return Promise.resolve(TaskStatus.Failure);
        },
        hadEmptyScript: false
      });

      return taskRunner
        .execute()
        .then(() => fail(EXPECTED_FAIL))
        .catch((err) => {
          expect(err.message).toMatchSnapshot();
          expect(terminalProvider.getOutput()).toMatch(
            /List of errors:\S.* - error #1;\S.*lines omitted.* - error #48;\S.* - error #50;\S/
          );
          checkConsoleOutput(terminalProvider);
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
          terminal,
          allowWarningsInSuccessfulBuild: false
        };
      });

      it('Logs warnings correctly', () => {
        taskRunner = createTaskRunner(taskRunnerOptions, {
          name: 'success with warnings (failure)',
          isIncrementalBuildAllowed: false,
          execute: (writer: ITaskWriter) => {
            writer.write('Build step 1' + EOL);
            writer.write('Warning: step 1 succeeded with warnings' + EOL);
            return Promise.resolve(TaskStatus.SuccessWithWarning);
          },
          hadEmptyScript: false
        });

        return taskRunner
          .execute()
          .then(() => fail('Promise returned by execute() resolved but was expected to fail'))
          .catch((err) => {
            expect(err.message).toMatchSnapshot();
            const allMessages: string = terminalProvider.getOutput();
            expect(allMessages).toContain('Build step 1');
            expect(allMessages).toContain('step 1 succeeded with warnings');
            checkConsoleOutput(terminalProvider);
          });
      });
    });

    describe('Success on warning', () => {
      beforeEach(() => {
        taskRunnerOptions = {
          quietMode: false,
          parallelism: '1',
          changedProjectsOnly: false,
          terminal,
          allowWarningsInSuccessfulBuild: true
        };
      });

      it('Logs warnings correctly', () => {
        taskRunner = createTaskRunner(taskRunnerOptions, {
          name: 'success with warnings (success)',
          isIncrementalBuildAllowed: false,
          execute: (writer: ITaskWriter) => {
            writer.write('Build step 1' + EOL);
            writer.write('Warning: step 1 succeeded with warnings' + EOL);
            return Promise.resolve(TaskStatus.SuccessWithWarning);
          },
          hadEmptyScript: false
        });

        return taskRunner
          .execute()
          .then(() => {
            const allMessages: string = terminalProvider.getOutput();
            expect(allMessages).toContain('Build step 1');
            expect(allMessages).toContain('Warning: step 1 succeeded with warnings');
            checkConsoleOutput(terminalProvider);
          })
          .catch((err) => fail('Promise returned by execute() rejected but was expected to resolve'));
      });
    });
  });
});
