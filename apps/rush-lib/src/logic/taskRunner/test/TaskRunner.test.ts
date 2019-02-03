import { EOL } from 'os';
import { TaskRunner } from '../TaskRunner';
import { ITaskWriter } from '@microsoft/stream-collator';
import { TaskStatus } from '../TaskStatus';
import { ITaskDefinition } from '../ITask';

class TestConsole {
  public messages: Array<String> = [];

  public log(message: string): void {
    this.messages.push(message);
  }

  public concatenate(): string {
    return this.messages.join(EOL);
  }
}

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

describe('TaskRunner', () => {
  let logger: TestConsole;
  let taskRunner: TaskRunner;

  describe('Constructor', () => {
    it('throwsErrorOnInvalidParallelism', () => {
      logger = new TestConsole();
      expect(() => new TaskRunner(false, 'tequila', false, logger))
        .toThrowErrorMatchingSnapshot();
    });
  });

  describe('Dependencies', () => {
    beforeEach(() => {
      logger = new TestConsole();
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
        })
        .catch(error => fail(error));
    });
  });

  describe('Error logging', () => {
    beforeEach(() => {
      logger = new TestConsole();
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
          const allMessages: string = logger.concatenate();
          expect(allMessages).not.toContain('Hold my beer...');
          expect(allMessages).toContain('Woops');
        });
    });
  });
});
