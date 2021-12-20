// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TaskCollection } from '../TaskCollection';
import { Task } from '../Task';
import { StringBufferTerminalProvider } from '@rushstack/node-core-library';
import { MockTaskRunner } from './MockTaskRunner';
import { TaskStatus } from '../TaskStatus';

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
      taskCollection = new TaskCollection();
    });

    it('throwsErrorOnNonExistentTask', () => {
      expect(() => taskCollection.addDependencies('foo', [])).toThrowErrorMatchingSnapshot();
    });

    it('throwsErrorOnNonExistentDependency', () => {
      taskCollection.addTask(new MockTaskRunner('foo'));
      expect(() => taskCollection.addDependencies('foo', ['bar'])).toThrowErrorMatchingSnapshot();
    });

    it('detectsDependencyCycle', () => {
      taskCollection.addTask(new MockTaskRunner('foo'));
      taskCollection.addTask(new MockTaskRunner('bar'));
      taskCollection.addDependencies('foo', ['bar']);
      taskCollection.addDependencies('bar', ['foo']);
      expect(() => taskCollection.getOrderedTasks()).toThrowErrorMatchingSnapshot();
    });

    it('respectsDependencyOrder', () => {
      const result: string[] = [];
      taskCollection.addTask(
        new MockTaskRunner('two', async () => {
          result.push('2');
          return TaskStatus.Success;
        })
      );
      taskCollection.addTask(
        new MockTaskRunner('one', async () => {
          result.push('1');
          return TaskStatus.Success;
        })
      );
      taskCollection.addDependencies('two', ['one']);

      const tasks: Task[] = taskCollection.getOrderedTasks();
      expect(tasks.map((t) => t.name).join(',')).toEqual('one,two');
      checkConsoleOutput(terminalProvider);
    });
  });
});
