// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TaskCollection } from '../TaskCollection';
import { ITaskWriter } from '@rushstack/stream-collator';
import { TaskStatus } from '../TaskStatus';
import { Task } from '../Task';
import { StringBufferTerminalProvider } from '@rushstack/node-core-library';
import { BaseBuilder } from '../BaseBuilder';

class DummyBuilder extends BaseBuilder {
  public readonly name: string;
  private readonly _action: (() => void) | undefined;
  public readonly hadEmptyScript: boolean = false;
  public readonly isIncrementalBuildAllowed: boolean = false;

  public constructor(name: string, action?: () => void) {
    super();

    this.name = name;
    this._action = action;
  }

  public async execute(writer: ITaskWriter): Promise<TaskStatus> {
    if (this._action) {
      this._action();
    }
    return TaskStatus.Success;
  }
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
      expect(() => taskCollection.addDependencies('foo', [])).toThrowErrorMatchingSnapshot();
    });

    it('throwsErrorOnNonExistentDependency', () => {
      taskCollection.addTask(new DummyBuilder('foo'));
      expect(() => taskCollection.addDependencies('foo', ['bar'])).toThrowErrorMatchingSnapshot();
    });

    it('detectsDependencyCycle', () => {
      taskCollection.addTask(new DummyBuilder('foo'));
      taskCollection.addTask(new DummyBuilder('bar'));
      taskCollection.addDependencies('foo', ['bar']);
      taskCollection.addDependencies('bar', ['foo']);
      expect(() => taskCollection.getOrderedTasks()).toThrowErrorMatchingSnapshot();
    });

    it('respectsDependencyOrder', () => {
      const result: string[] = [];
      taskCollection.addTask(new DummyBuilder('two', () => result.push('2')));
      taskCollection.addTask(new DummyBuilder('one', () => result.push('1')));
      taskCollection.addDependencies('two', ['one']);

      const tasks: Task[] = taskCollection.getOrderedTasks();
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
