// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="mocha" />

import { assert } from 'chai';
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
    it('can register a task', (done: MochaDone) => {
      const helloWorldWriter: ITaskWriter = Interleaver.registerTask('Hello World');
      assert.isObject(helloWorldWriter);
      done();
    });

    it('should not let you register two tasks with the same name', (done: MochaDone) => {
      const taskName: string = 'Hello World';
      assert.doesNotThrow(() => {
        Interleaver.registerTask(taskName);
      });
      assert.throws(() => {
        Interleaver.registerTask(taskName);
      });
      done();
    });

    it('should not let you close a task twice', (done: MochaDone) => {
      const taskName: string = 'Hello World';
      const task: ITaskWriter = Interleaver.registerTask(taskName);
      task.close();
      assert.throws(task.close);
      done();
    });

    it('should not let you write to a closed task', (done: MochaDone) => {
      const taskName: string = 'Hello World';
      const task: ITaskWriter = Interleaver.registerTask(taskName);
      task.close();
      assert.throws(() => {
        task.write('1');
      });
      done();
    });
  });

  describe('Testing write functions', () => {
    it('writeLine should add a newline', (done: MochaDone) => {
      const taskA: ITaskWriter = Interleaver.registerTask('A');
      const text: string = 'Hello World';

      taskA.writeLine(text);

      assert.equal(taskA.getStdOutput(), text + os.EOL);
      done();
    });

    it('should write errors to stderr', (done: MochaDone) => {
      const taskA: ITaskWriter = Interleaver.registerTask('A');
      const error: string = 'Critical error';

      taskA.writeError(error);
      assert.equal(stdout.read(), error);

      taskA.close();

      assert.equal(taskA.getStdOutput(), '');
      assert.equal(taskA.getStdError(), error);

      done();
    });
  });

  describe('Testing that output is interleaved', () => {
    it('should not write non-active tasks to stdout', (done: MochaDone) => {
      const taskA: ITaskWriter = Interleaver.registerTask('A');
      const taskB: ITaskWriter = Interleaver.registerTask('B');

      taskA.write('1');
      assert.equal(stdout.read(), '1');

      taskB.write('2');
      assert.equal(stdout.read(), '1');

      taskA.write('3');
      assert.equal(stdout.read(), '13');

      taskA.close();
      assert.equal(stdout.read(), '13');

      taskB.close();
      assert.equal(stdout.read(), '132');

      assert.equal(taskA.getStdOutput(), '13');
      assert.equal(taskB.getStdOutput(), '2');
      done();
    });

    it('should not write anything when in quiet mode', (done: MochaDone) => {
      const taskA: ITaskWriter = Interleaver.registerTask('A', true);
      const taskB: ITaskWriter = Interleaver.registerTask('B', true);

      taskA.write('1');
      assert.equal(stdout.read(), '');

      taskB.write('2');
      assert.equal(stdout.read(), '');

      taskA.write('3');
      assert.equal(stdout.read(), '');

      taskA.close();
      assert.equal(stdout.read(), '');

      taskB.close();
      assert.equal(stdout.read(), '');

      assert.equal(taskA.getStdOutput(), '13');
      assert.equal(taskB.getStdOutput(), '2');
      done();
    });

    it('should update the active task once the active task is closed', (done: MochaDone) => {
      const taskA: ITaskWriter = Interleaver.registerTask('A');
      const taskB: ITaskWriter = Interleaver.registerTask('B');

      taskA.write('1');
      assert.equal(stdout.read(), '1');

      taskA.close();
      assert.equal(stdout.read(), '1');

      taskB.write('2');
      assert.equal(stdout.read(), '12');

      taskB.close();
      assert.equal(stdout.read(), '12');

      assert.equal(taskA.getStdOutput(), '1');
      assert.equal(taskB.getStdOutput(), '2');
      done();
    });

    it('should write completed tasks after the active task is completed', (done: MochaDone) => {
      const taskA: ITaskWriter = Interleaver.registerTask('A');
      const taskB: ITaskWriter = Interleaver.registerTask('B');

      taskA.write('1');
      assert.equal(stdout.read(), '1');

      taskB.write('2');
      assert.equal(stdout.read(), '1');

      taskB.close();
      assert.equal(stdout.read(), '1');

      taskA.close();
      assert.equal(stdout.read(), '12');

      assert.equal(taskA.getStdOutput(), '1');
      assert.equal(taskB.getStdOutput(), '2');
      done();
    });
  });
});
