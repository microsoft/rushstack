import { TaskCollection } from '../TaskCollection';
import { ITaskWriter } from '@microsoft/stream-collator';
import { TaskStatus } from '../TaskStatus';
import { ITaskDefinition, ITask } from '../ITask';
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
    },
    hadEmptyScript: false
  };
}

function checkConsoleOutput(terminalProvider: StringBufferTerminalProvider): void {
  expect(terminalProvider.getOutput()).toMatchSnapshot();
  expect(terminalProvider.getVerbose()).toMatchSnapshot();
  expect(terminalProvider.getWarningOutput()).toMatchSnapshot();
  expect(terminalProvider.getErrorOutput()).toMatchSnapshot();
}

describe('TaskCollection', () => {
  let terminalProvider: StringBufferTerminalProvider;
  let taskCollection: TaskCollection;

  beforeEach(() => {
    terminalProvider = new StringBufferTerminalProvider(true);
  });

  describe('Dependencies', () => {
    beforeEach(() => {
      taskCollection = new TaskCollection({
          quietMode: false
      });
    });

    it('throwsErrorOnNonExistentTask', () => {
      expect(() => taskCollection.addDependencies('foo', []))
        .toThrowErrorMatchingSnapshot();
    });

    it('throwsErrorOnNonExistentDependency', () => {
      taskCollection.addTask(createDummyTask('foo'));
      expect(() => taskCollection.addDependencies('foo', ['bar']))
        .toThrowErrorMatchingSnapshot();
    });

    it('detectsDependencyCycle', () => {
      taskCollection.addTask(createDummyTask('foo'));
      taskCollection.addTask(createDummyTask('bar'));
      taskCollection.addDependencies('foo', ['bar']);
      taskCollection.addDependencies('bar', ['foo']);
      expect(() => taskCollection.getOrderedTasks()).toThrowErrorMatchingSnapshot();
    });

    it('respectsDependencyOrder', () => {
      const result: Array<string> = [];
      taskCollection.addTask(createDummyTask('two', () => result.push('2')));
      taskCollection.addTask(createDummyTask('one', () => result.push('1')));
      taskCollection.addDependencies('two', ['one']);

      const tasks: ITask[] = taskCollection.getOrderedTasks();
      expect(tasks.map((t) => t.name).join(',')).toEqual('one,two');
      checkConsoleOutput(terminalProvider);
    });
  });

  describe('Error logging', () => {
    beforeEach(() => {
      taskCollection = new TaskCollection({
        quietMode: false
      });
    });
  });
});
