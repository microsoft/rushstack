// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import * as os from 'os';

import { Interleaver, ITaskWriter } from '../Interleaver';

class StringStream {
  private _buffer: string[] = [];

  public write(text: string): void {
    this._buffer.push(text);
  }

  public read(): string {
    return this._buffer.join('');
  }

  public reset(): void {
    this._buffer = [];
  }
}

const stdout: StringStream = new StringStream();
Interleaver.setStdOut(stdout);

describe('Interleaver tests', () => {
  // Reset task information before each test
  beforeEach(() => {
    Interleaver.reset();
    stdout.reset();
  });

  describe('Testing register and close', () => {
    it('can register a task', () => {
      const helloWorldWriter: ITaskWriter = Interleaver.registerTask('Hello World');
      expect(typeof helloWorldWriter).toEqual('object');
    });

    it('should not let you register two tasks with the same name', () => {
      const taskName: string = 'Hello World';
      expect(() => { Interleaver.registerTask(taskName); }).not.toThrow();
      expect(() => { Interleaver.registerTask(taskName); }).toThrow();
    });

    it('should not let you close a task twice', () => {
      const taskName: string = 'Hello World';
      const task: ITaskWriter = Interleaver.registerTask(taskName);
      task.close();
      expect(task.close).toThrow();
    });

    it('should not let you write to a closed task', () => {
      const taskName: string = 'Hello World';
      const task: ITaskWriter = Interleaver.registerTask(taskName);
      task.close();
      expect(() => { task.write('1'); }).toThrow();
    });
  });

  describe('Testing write functions', () => {
    it('writeLine should add a newline', () => {
      const taskA: ITaskWriter = Interleaver.registerTask('A');
      const text: string = 'Hello World';

      taskA.writeLine(text);

      expect(taskA.getStdOutput()).toEqual(text + os.EOL);
    });

    it('should write errors to stderr', () => {
      const taskA: ITaskWriter = Interleaver.registerTask('A');
      const error: string = 'Critical error';

      taskA.writeError(error);
      expect(stdout.read()).toEqual(error);

      taskA.close();

      expect(taskA.getStdOutput()).toEqual('');
      expect(taskA.getStdError()).toEqual(error);

    });
  });

  describe('Testing that output is interleaved', () => {
    it('should not write non-active tasks to stdout', () => {
      const taskA: ITaskWriter = Interleaver.registerTask('A');
      const taskB: ITaskWriter = Interleaver.registerTask('B');

      taskA.write('1');
      expect(stdout.read()).toEqual('1');

      taskB.write('2');
      expect(stdout.read()).toEqual('1');

      taskA.write('3');
      expect(stdout.read()).toEqual('13');

      taskA.close();
      expect(stdout.read()).toEqual('13');

      taskB.close();
      expect(stdout.read()).toEqual('132');

      expect(taskA.getStdOutput()).toEqual('13');
      expect(taskB.getStdOutput()).toEqual('2');
    });

    it('should not write anything when in quiet mode', () => {
      const taskA: ITaskWriter = Interleaver.registerTask('A', true);
      const taskB: ITaskWriter = Interleaver.registerTask('B', true);

      taskA.write('1');
      expect(stdout.read()).toEqual('');

      taskB.write('2');
      expect(stdout.read()).toEqual('');

      taskA.write('3');
      expect(stdout.read()).toEqual('');

      taskA.close();
      expect(stdout.read()).toEqual('');

      taskB.close();
      expect(stdout.read()).toEqual('');

      expect(taskA.getStdOutput()).toEqual('13');
      expect(taskB.getStdOutput()).toEqual('2');
    });

    it('should update the active task once the active task is closed', () => {
      const taskA: ITaskWriter = Interleaver.registerTask('A');
      const taskB: ITaskWriter = Interleaver.registerTask('B');

      taskA.write('1');
      expect(stdout.read()).toEqual('1');

      taskA.close();
      expect(stdout.read()).toEqual('1');

      taskB.write('2');
      expect(stdout.read()).toEqual('12');

      taskB.close();
      expect(stdout.read()).toEqual('12');

      expect(taskA.getStdOutput()).toEqual('1');
      expect(taskB.getStdOutput()).toEqual('2');
    });

    it('should write completed tasks after the active task is completed', () => {
      const taskA: ITaskWriter = Interleaver.registerTask('A');
      const taskB: ITaskWriter = Interleaver.registerTask('B');

      taskA.write('1');
      expect(stdout.read()).toEqual('1');

      taskB.write('2');
      expect(stdout.read()).toEqual('1');

      taskB.close();
      expect(stdout.read()).toEqual('1');

      taskA.close();
      expect(stdout.read()).toEqual('12');

      expect(taskA.getStdOutput()).toEqual('1');
      expect(taskB.getStdOutput()).toEqual('2');
    });
  });
});
