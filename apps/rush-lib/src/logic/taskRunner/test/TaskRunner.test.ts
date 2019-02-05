import { EOL } from 'os';
import { TaskRunner } from '../TaskRunner';
import { ITaskWriter } from '@microsoft/stream-collator';
import { TaskStatus } from '../TaskStatus';
import { ITaskDefinition } from '../ITask';
import { StringBufferTerminalProvider } from '@microsoft/node-core-library';

function createDummyTask(name: string, action?: () => void): ITaskDefinition {
  return {
    name,
    isIncrementalBuildAllowed: false,
    execute: (writer: ITaskWriter) => {
      if (action) {
        action();
      }
      return Promise.resolve(TaskStatus.Success);
    }
  };
}

function checkConsoleOutput(logger: StringBufferTerminalProvider): void {
  expect(logger.getOutput()).toMatchSnapshot();
  expect(logger.getVerbose()).toMatchSnapshot();
  expect(logger.getWarningOutput()).toMatchSnapshot();
  expect(logger.getErrorOutput()).toMatchSnapshot();
}

describe('TaskRunner', () => {
  let logger: StringBufferTerminalProvider;
  let taskRunner: TaskRunner;

  describe('Constructor', () => {
    it('throwsErrorOnInvalidParallelism', () => {
      logger = new StringBufferTerminalProvider(true);
      expect(() => new TaskRunner(false, 'tequila', false, logger))
        .toThrowErrorMatchingSnapshot();
    });
  });

  describe('Dependencies', () => {
    beforeEach(() => {
      logger = new StringBufferTerminalProvider(true);
      taskRunner = new TaskRunner(false, '1', false, logger);
    });

    it('throwsErrorOnNonExistentTask', () => {
      expect(() => taskRunner.addDependencies('foo', []))
        .toThrowErrorMatchingSnapshot();
    });

    it('throwsErrorOnNonExistentDependency', () => {
      taskRunner.addTask(createDummyTask('foo'));
      expect(() => taskRunner.addDependencies('foo', ['bar']))
        .toThrowErrorMatchingSnapshot();
    });

    it('detectsDependencyCycle', () => {
      taskRunner.addTask(createDummyTask('foo'));
      taskRunner.addTask(createDummyTask('bar'));
      taskRunner.addDependencies('foo', ['bar']);
      taskRunner.addDependencies('bar', ['foo']);
      expect(() => taskRunner.execute()).toThrowErrorMatchingSnapshot();
    });

    it('respectsDependencyOrder', () => {
      const result: Array<string> = [];
      taskRunner.addTask(createDummyTask('two', () => result.push('2')));
      taskRunner.addTask(createDummyTask('one', () => result.push('1')));
      taskRunner.addDependencies('two', ['one']);
      return taskRunner
        .execute()
        .then(() => {
          expect(result.join(',')).toEqual('1,2');
          checkConsoleOutput(logger);
        })
        .catch(error => fail(error));
    });
  });

  describe('Error logging', () => {
    beforeEach(() => {
      logger = new StringBufferTerminalProvider(true);
      taskRunner = new TaskRunner(false, '1', false, logger);
    });

    const EXPECTED_FAIL: string = 'Promise returned by execute() resolved but was expected to fail';

    it('printedStderrAfterError', () => {
      taskRunner.addTask({
        name: 'stdout+stderr',
        isIncrementalBuildAllowed: false,
        execute: (writer: ITaskWriter) => {
          writer.write('Hold my beer...' + EOL);
          writer.writeError('Woops' + EOL);
          return Promise.resolve(TaskStatus.Failure);
        }
      });
      return taskRunner
        .execute()
        .then(() => fail(EXPECTED_FAIL))
        .catch(err => {
          expect(err.message).toMatchSnapshot();
          const allMessages: string = logger.getOutput();
          expect(allMessages).not.toContain('Hold my beer...');
          expect(allMessages).toContain('Woops');
          checkConsoleOutput(logger);
        });
    });
  });
});
