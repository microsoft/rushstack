// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalChunkKind, MockWritable } from '@rushstack/terminal';

import { StreamCollator } from '../StreamCollator.ts';
import type { CollatedWriter } from '../CollatedWriter.ts';

let collator: StreamCollator;
const mockWritable: MockWritable = new MockWritable();

describe(StreamCollator.name, () => {
  // Reset task information before each test
  beforeEach(() => {
    mockWritable.reset();
    collator = new StreamCollator({ destination: mockWritable });
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
        writer.terminal.writeChunk({ text: '1', kind: TerminalChunkKind.Stdout });
      }).toThrow();
    });
  });

  describe('Testing write functions', () => {
    it('writeLine should add a newline', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const text: string = 'Hello World';

      taskA.terminal.writeChunk({ text, kind: TerminalChunkKind.Stdout });

      expect(mockWritable.chunks).toEqual([{ text, kind: TerminalChunkKind.Stdout }]);
    });

    it('should write errors to stderr', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const error: string = 'Critical error';

      taskA.terminal.writeChunk({ text: error, kind: TerminalChunkKind.Stderr });

      expect(mockWritable.chunks).toEqual([{ text: error, kind: TerminalChunkKind.Stderr }]);

      taskA.close();

      expect(taskA.bufferedChunks).toEqual([]);
      expect(mockWritable.chunks).toEqual([{ text: error, kind: TerminalChunkKind.Stderr }]);
    });
  });

  describe('Testing that output is interleaved', () => {
    it('should not write non-active tasks to stdout', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const taskB: CollatedWriter = collator.registerTask('B');

      taskA.terminal.writeChunk({ text: '1', kind: TerminalChunkKind.Stdout });
      expect(taskA.bufferedChunks).toEqual([]);
      expect(mockWritable.chunks).toEqual([{ text: '1', kind: TerminalChunkKind.Stdout }]);

      taskB.terminal.writeChunk({ text: '2', kind: TerminalChunkKind.Stdout });
      expect(taskB.bufferedChunks).toEqual([{ text: '2', kind: TerminalChunkKind.Stdout }]);
      expect(mockWritable.chunks).toEqual([{ text: '1', kind: TerminalChunkKind.Stdout }]);

      taskA.terminal.writeChunk({ text: '3', kind: TerminalChunkKind.Stdout });
      expect(mockWritable.chunks).toEqual([
        { text: '1', kind: TerminalChunkKind.Stdout },
        { text: '3', kind: TerminalChunkKind.Stdout }
      ]);

      taskA.close();
      expect(mockWritable.chunks).toEqual([
        { text: '1', kind: TerminalChunkKind.Stdout },
        { text: '3', kind: TerminalChunkKind.Stdout },
        { text: '2', kind: TerminalChunkKind.Stdout }
      ]);

      taskB.close();
      expect(mockWritable.chunks).toEqual([
        { text: '1', kind: TerminalChunkKind.Stdout },
        { text: '3', kind: TerminalChunkKind.Stdout },
        { text: '2', kind: TerminalChunkKind.Stdout }
      ]);

      expect(taskA.bufferedChunks).toEqual([]);
      expect(taskB.bufferedChunks).toEqual([]);
    });

    it('should update the active task once the active task is closed', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const taskB: CollatedWriter = collator.registerTask('B');

      taskA.terminal.writeChunk({ text: '1', kind: TerminalChunkKind.Stdout });
      expect(mockWritable.chunks).toEqual([{ text: '1', kind: TerminalChunkKind.Stdout }]);
      taskA.close();

      taskB.terminal.writeChunk({ text: '2', kind: TerminalChunkKind.Stdout });
      expect(mockWritable.chunks).toEqual([
        { text: '1', kind: TerminalChunkKind.Stdout },
        { text: '2', kind: TerminalChunkKind.Stdout }
      ]);
      taskB.close();
      expect(mockWritable.chunks).toEqual([
        { text: '1', kind: TerminalChunkKind.Stdout },
        { text: '2', kind: TerminalChunkKind.Stdout }
      ]);
    });

    it('should write completed tasks after the active task is completed', () => {
      const taskA: CollatedWriter = collator.registerTask('A');
      const taskB: CollatedWriter = collator.registerTask('B');

      taskA.terminal.writeChunk({ text: '1', kind: TerminalChunkKind.Stdout });
      expect(mockWritable.chunks).toEqual([{ text: '1', kind: TerminalChunkKind.Stdout }]);

      taskB.terminal.writeChunk({ text: '2', kind: TerminalChunkKind.Stdout });
      expect(mockWritable.chunks).toEqual([{ text: '1', kind: TerminalChunkKind.Stdout }]);

      taskB.close();
      expect(mockWritable.chunks).toEqual([{ text: '1', kind: TerminalChunkKind.Stdout }]);

      taskA.close();
      expect(mockWritable.chunks).toEqual([
        { text: '1', kind: TerminalChunkKind.Stdout },
        { text: '2', kind: TerminalChunkKind.Stdout }
      ]);
    });
  });
});
