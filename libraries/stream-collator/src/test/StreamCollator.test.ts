// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StreamCollator } from '../StreamCollator';
import { CollatedWriter } from '../CollatedWriter';
import { ICollatedChunk, StreamKind } from '../CollatedChunk';

let collator: StreamCollator;
const outputMessages: ICollatedChunk[] = [];

describe('StreamCollator tests', () => {
  // Reset task information before each test
  beforeEach(() => {
    outputMessages.length = 0;
    collator = new StreamCollator({
      writeToStream: (chunk: ICollatedChunk) => {
        outputMessages.push(chunk);
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
        writer.terminal.writeChunk({ text: '1', stream: StreamKind.Stdout });
      }).toThrow();
    });
  });

  describe('Testing write functions', () => {
    it('writeLine should add a newline', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const text: string = 'Hello World';

      taskA.terminal.writeChunk({ text, stream: StreamKind.Stdout });

      expect(outputMessages).toEqual([{ text, stream: StreamKind.Stdout }]);
    });

    it('should write errors to stderr', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const error: string = 'Critical error';

      taskA.terminal.writeChunk({ text: error, stream: StreamKind.Stderr });

      expect(outputMessages).toEqual([{ text: error, stream: StreamKind.Stderr }]);

      taskA.close();

      expect(taskA.accumulatedChunks).toEqual([]);
      expect(outputMessages).toEqual([{ text: error, stream: StreamKind.Stderr }]);
    });
  });

  describe('Testing that output is interleaved', () => {
    it('should not write non-active tasks to stdout', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const taskB: CollatedWriter = collator.registerTask('B');

      taskA.terminal.writeChunk({ text: '1', stream: StreamKind.Stdout });
      expect(taskA.accumulatedChunks).toEqual([]);
      expect(outputMessages).toEqual([{ text: '1', stream: StreamKind.Stdout }]);

      taskB.terminal.writeChunk({ text: '2', stream: StreamKind.Stdout });
      expect(taskB.accumulatedChunks).toEqual([{ text: '2', stream: StreamKind.Stdout }]);
      expect(outputMessages).toEqual([{ text: '1', stream: StreamKind.Stdout }]);

      taskA.terminal.writeChunk({ text: '3', stream: StreamKind.Stdout });
      expect(outputMessages).toEqual([
        { text: '1', stream: StreamKind.Stdout },
        { text: '3', stream: StreamKind.Stdout }
      ]);

      taskA.close();
      expect(outputMessages).toEqual([
        { text: '1', stream: StreamKind.Stdout },
        { text: '3', stream: StreamKind.Stdout }
      ]);

      taskB.close();
      expect(outputMessages).toEqual([
        { text: '1', stream: StreamKind.Stdout },
        { text: '3', stream: StreamKind.Stdout },
        { text: '2', stream: StreamKind.Stdout }
      ]);

      expect(taskA.accumulatedChunks).toEqual([]);
      expect(taskB.accumulatedChunks).toEqual([]);
    });

    it('should update the active task once the active task is closed', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const taskB: CollatedWriter = collator.registerTask('B');

      taskA.terminal.writeChunk({ text: '1', stream: StreamKind.Stdout });
      expect(outputMessages).toEqual([{ text: '1', stream: StreamKind.Stdout }]);
      taskA.close();

      taskB.terminal.writeChunk({ text: '2', stream: StreamKind.Stdout });
      expect(outputMessages).toEqual([
        { text: '1', stream: StreamKind.Stdout },
        { text: '2', stream: StreamKind.Stdout }
      ]);
      taskB.close();
      expect(outputMessages).toEqual([
        { text: '1', stream: StreamKind.Stdout },
        { text: '2', stream: StreamKind.Stdout }
      ]);
    });

    it('should write completed tasks after the active task is completed', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const taskB: CollatedWriter = collator.registerTask('B');

      taskA.terminal.writeChunk({ text: '1', stream: StreamKind.Stdout });
      expect(outputMessages).toEqual([{ text: '1', stream: StreamKind.Stdout }]);

      taskB.terminal.writeChunk({ text: '2', stream: StreamKind.Stdout });
      expect(outputMessages).toEqual([{ text: '1', stream: StreamKind.Stdout }]);

      taskB.close();
      expect(outputMessages).toEqual([{ text: '1', stream: StreamKind.Stdout }]);

      taskA.close();
      expect(outputMessages).toEqual([
        { text: '1', stream: StreamKind.Stdout },
        { text: '2', stream: StreamKind.Stdout }
      ]);
    });
  });
});
