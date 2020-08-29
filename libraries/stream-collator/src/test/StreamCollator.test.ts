// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StreamCollator } from '../StreamCollator';
import { CollatedWriter, IStdioMessage } from '../CollatedWriter';

let collator: StreamCollator;
const outputMessages: IStdioMessage[] = [];

describe('StreamCollator tests', () => {
  // Reset task information before each test
  beforeEach(() => {
    outputMessages.length = 0;
    collator = new StreamCollator({
      writeToStream: (message: IStdioMessage) => {
        outputMessages.push(message);
      }
    });
  });

  describe('Testing register and close', () => {
    it('can register a task', () => {
      const helloWorldWriter: CollatedWriter = collator.registerTask('Hello World');
      expect(helloWorldWriter.taskName).toEqual('Hello World');
    });

    it('should not let you register two tasks with the same name', () => {
      const taskName: string = 'Hello World';
      expect(() => {
        collator.registerTask(taskName);
      }).not.toThrow();
      expect(() => {
        collator.registerTask(taskName);
      }).toThrow();
    });

    it('should not let you close a task twice', () => {
      const taskName: string = 'Hello World';
      const writer: CollatedWriter = collator.registerTask(taskName);
      writer.close();
      expect(writer.close).toThrow();
    });

    it('should not let you write to a closed task', () => {
      const taskName: string = 'Hello World';
      const writer: CollatedWriter = collator.registerTask(taskName);
      writer.close();
      expect(() => {
        writer.writeMessage({ text: '1', stream: 'stdout' });
      }).toThrow();
    });
  });

  describe('Testing write functions', () => {
    it('writeLine should add a newline', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const text: string = 'Hello World';

      taskA.writeMessage({ text, stream: 'stdout' });

      expect(outputMessages).toEqual([{ text, stream: 'stdout' }]);
    });

    it('should write errors to stderr', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const error: string = 'Critical error';

      taskA.writeMessage({ text: error, stream: 'stderr' });

      expect(outputMessages).toEqual([{ text: error, stream: 'stderr' }]);

      taskA.close();

      expect(taskA.accumulatedMessages).toEqual([]);
      expect(outputMessages).toEqual([{ text: error, stream: 'stderr' }]);
    });
  });

  describe('Testing that output is interleaved', () => {
    it('should not write non-active tasks to stdout', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const taskB: CollatedWriter = collator.registerTask('B');

      taskA.writeMessage({ text: '1', stream: 'stdout' });
      expect(taskA.accumulatedMessages).toEqual([]);
      expect(outputMessages).toEqual([{ text: '1', stream: 'stdout' }]);

      taskB.writeMessage({ text: '2', stream: 'stdout' });
      expect(taskB.accumulatedMessages).toEqual([{ text: '2', stream: 'stdout' }]);
      expect(outputMessages).toEqual([{ text: '1', stream: 'stdout' }]);

      taskA.writeMessage({ text: '3', stream: 'stdout' });
      expect(outputMessages).toEqual([
        { text: '1', stream: 'stdout' },
        { text: '3', stream: 'stdout' }
      ]);

      taskA.close();
      expect(outputMessages).toEqual([
        { text: '1', stream: 'stdout' },
        { text: '3', stream: 'stdout' }
      ]);

      taskB.close();
      expect(outputMessages).toEqual([
        { text: '1', stream: 'stdout' },
        { text: '3', stream: 'stdout' },
        { text: '2', stream: 'stdout' }
      ]);

      expect(taskA.accumulatedMessages).toEqual([]);
      expect(taskB.accumulatedMessages).toEqual([]);
    });

    it('should update the active task once the active task is closed', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const taskB: CollatedWriter = collator.registerTask('B');

      taskA.writeMessage({ text: '1', stream: 'stdout' });
      expect(outputMessages).toEqual([{ text: '1', stream: 'stdout' }]);
      taskA.close();

      taskB.writeMessage({ text: '2', stream: 'stdout' });
      expect(outputMessages).toEqual([
        { text: '1', stream: 'stdout' },
        { text: '2', stream: 'stdout' }
      ]);
      taskB.close();
      expect(outputMessages).toEqual([
        { text: '1', stream: 'stdout' },
        { text: '2', stream: 'stdout' }
      ]);
    });

    it('should write completed tasks after the active task is completed', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const taskB: CollatedWriter = collator.registerTask('B');

      taskA.writeMessage({ text: '1', stream: 'stdout' });
      expect(outputMessages).toEqual([{ text: '1', stream: 'stdout' }]);

      taskB.writeMessage({ text: '2', stream: 'stdout' });
      expect(outputMessages).toEqual([{ text: '1', stream: 'stdout' }]);

      taskB.close();
      expect(outputMessages).toEqual([{ text: '1', stream: 'stdout' }]);

      taskA.close();
      expect(outputMessages).toEqual([
        { text: '1', stream: 'stdout' },
        { text: '2', stream: 'stdout' }
      ]);
    });
  });
});
