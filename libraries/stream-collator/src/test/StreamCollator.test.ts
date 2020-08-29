// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import * as os from 'os';

import { StreamCollator } from '../StreamCollator';
import { CollatedWriter } from '../CollatedWriter';

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

const stringStream: StringStream = new StringStream();

describe('StreamCollator tests', () => {
  // Reset task information before each test
  beforeEach(() => {
    stringStream.reset();
  });

  describe('Testing register and close', () => {
    it('can register a task', () => {
      const collator: StreamCollator = new StreamCollator();
      collator.setStdOut(stringStream);

      const helloWorldWriter: CollatedWriter = collator.registerTask('Hello World');
      expect(helloWorldWriter.taskName).toEqual('Hello World');
    });

    it('should not let you register two tasks with the same name', () => {
      const collator: StreamCollator = new StreamCollator();
      collator.setStdOut(stringStream);

      const taskName: string = 'Hello World';
      expect(() => {
        collator.registerTask(taskName);
      }).not.toThrow();
      expect(() => {
        collator.registerTask(taskName);
      }).toThrow();
    });

    it('should not let you close a task twice', () => {
      const collator: StreamCollator = new StreamCollator();
      collator.setStdOut(stringStream);

      const taskName: string = 'Hello World';
      const writer: CollatedWriter = collator.registerTask(taskName);
      writer.close();
      expect(writer.close).toThrow();
    });

    it('should not let you write to a closed task', () => {
      const collator: StreamCollator = new StreamCollator();
      collator.setStdOut(stringStream);

      const taskName: string = 'Hello World';
      const writer: CollatedWriter = collator.registerTask(taskName);
      writer.close();
      expect(() => {
        writer.write('1');
      }).toThrow();
    });
  });

  describe('Testing write functions', () => {
    it('writeLine should add a newline', () => {
      const collator: StreamCollator = new StreamCollator();
      collator.setStdOut(stringStream);

      const taskA: CollatedWriter = collator.registerTask('A');
      const text: string = 'Hello World';

      taskA.writeLine(text);

      expect(taskA.getStdOutput()).toEqual(text + os.EOL);
    });

    it('should write errors to stderr', () => {
      const collator: StreamCollator = new StreamCollator();
      collator.setStdOut(stringStream);

      const taskA: CollatedWriter = collator.registerTask('A');
      const error: string = 'Critical error';

      taskA.writeError(error);
      expect(stringStream.read()).toEqual(error);

      taskA.close();

      expect(taskA.getStdOutput()).toEqual('');
      expect(taskA.getStdError()).toEqual(error);
    });
  });

  describe('Testing that output is interleaved', () => {
    it('should not write non-active tasks to stdout', () => {
      const collator: StreamCollator = new StreamCollator();
      collator.setStdOut(stringStream);

      const taskA: CollatedWriter = collator.registerTask('A');
      const taskB: CollatedWriter = collator.registerTask('B');

      taskA.write('1');
      expect(stringStream.read()).toEqual('1');

      taskB.write('2');
      expect(stringStream.read()).toEqual('1');

      taskA.write('3');
      expect(stringStream.read()).toEqual('13');

      taskA.close();
      expect(stringStream.read()).toEqual('13');

      taskB.close();
      expect(stringStream.read()).toEqual('132');

      expect(taskA.getStdOutput()).toEqual('13');
      expect(taskB.getStdOutput()).toEqual('2');
    });

    it('should not write anything when in quiet mode', () => {
      const collator: StreamCollator = new StreamCollator();
      collator.setStdOut(stringStream);

      const taskA: CollatedWriter = collator.registerTask('A', true);
      const taskB: CollatedWriter = collator.registerTask('B', true);

      taskA.write('1');
      expect(stringStream.read()).toEqual('');

      taskB.write('2');
      expect(stringStream.read()).toEqual('');

      taskA.write('3');
      expect(stringStream.read()).toEqual('');

      taskA.close();
      expect(stringStream.read()).toEqual('');

      taskB.close();
      expect(stringStream.read()).toEqual('');

      expect(taskA.getStdOutput()).toEqual('13');
      expect(taskB.getStdOutput()).toEqual('2');
    });

    it('should update the active task once the active task is closed', () => {
      const collator: StreamCollator = new StreamCollator();
      collator.setStdOut(stringStream);

      const taskA: CollatedWriter = collator.registerTask('A');
      const taskB: CollatedWriter = collator.registerTask('B');

      taskA.write('1');
      expect(stringStream.read()).toEqual('1');

      taskA.close();
      expect(stringStream.read()).toEqual('1');

      taskB.write('2');
      expect(stringStream.read()).toEqual('12');

      taskB.close();
      expect(stringStream.read()).toEqual('12');

      expect(taskA.getStdOutput()).toEqual('1');
      expect(taskB.getStdOutput()).toEqual('2');
    });

    it('should write completed tasks after the active task is completed', () => {
      const collator: StreamCollator = new StreamCollator();
      collator.setStdOut(stringStream);

      const taskA: CollatedWriter = collator.registerTask('A');
      const taskB: CollatedWriter = collator.registerTask('B');

      taskA.write('1');
      expect(stringStream.read()).toEqual('1');

      taskB.write('2');
      expect(stringStream.read()).toEqual('1');

      taskB.close();
      expect(stringStream.read()).toEqual('1');

      taskA.close();
      expect(stringStream.read()).toEqual('12');

      expect(taskA.getStdOutput()).toEqual('1');
      expect(taskB.getStdOutput()).toEqual('2');
    });
  });
});
