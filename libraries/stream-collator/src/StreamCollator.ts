// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CollatedWriter } from './CollatedWriter';
import { CollatedTerminal } from './CollatedTerminal';
import { TerminalWritable } from './TerminalWritable';
import { ITerminalChunk } from './ITerminalChunk';
import { InternalError } from '@rushstack/node-core-library';

/** @beta */
export interface IStreamCollatorOptions {
  destination: TerminalWritable;
  onWriterActive?: (writer: CollatedWriter) => void;
}

/**
 * A static class which manages the output of multiple threads.
 *
 * @beta
 */
export class StreamCollator {
  private _taskNames: Set<string> = new Set();
  private _writers: Set<CollatedWriter> = new Set();

  // The writer whose output is being shown in realtime, or undefined if none
  private _activeWriter: CollatedWriter | undefined = undefined;

  // Writers that have accumulated buffered chunks and are not closed yet
  private _openBufferedWriters: Set<CollatedWriter> = new Set();

  // Writers that have accumulated buffered chunks and are now closed
  private _closedBufferedWriters: Set<CollatedWriter> = new Set();

  private _onWriterActive: ((writer: CollatedWriter) => void) | undefined;

  private _preventReentrantCall: boolean = false;

  public readonly destination: TerminalWritable;
  public readonly terminal: CollatedTerminal;

  public constructor(options: IStreamCollatorOptions) {
    this.destination = options.destination;
    this.terminal = new CollatedTerminal(this.destination);
    this._onWriterActive = options.onWriterActive;
  }

  public get activeWriter(): CollatedWriter | undefined {
    return this._activeWriter;
  }

  public get activeTaskName(): string {
    if (this._activeWriter) {
      return this._activeWriter.taskName;
    }
    return undefined;
  }

  public get writers(): ReadonlySet<CollatedWriter> {
    return this._writers;
  }

  /**
   * Registers a task into the list of active buffers and returns a ITaskWriter for the
   * calling process to use to manage output.
   */
  public registerTask(taskName: string): CollatedWriter {
    if (this._taskNames.has(taskName)) {
      throw new Error('A task with that name has already been registered');
    }

    const writer: CollatedWriter = new CollatedWriter(taskName, this);

    this._writers.add(writer);
    this._taskNames.add(writer.taskName);

    return writer;
  }

  /** @internal */
  public _writerWriteChunk(
    writer: CollatedWriter,
    chunk: ITerminalChunk,
    bufferedChunks: ITerminalChunk[]
  ): void {
    this._checkForReentrantCall();

    if (this._activeWriter === undefined) {
      // If no writer is currently active, then the first one to write something becomes active
      this._assignActiveWriter(writer);
    }

    if (writer.isActive) {
      this.destination.writeChunk(chunk);
    } else {
      if (bufferedChunks.length === 0) {
        this._openBufferedWriters.add(writer);
      }
      bufferedChunks.push(chunk);
    }
  }

  /** @internal */
  public _writerClose(writer: CollatedWriter, bufferedChunks: ITerminalChunk[]): void {
    this._checkForReentrantCall();

    if (writer.isActive) {
      writer.flushBufferedChunks();

      this._activeWriter = undefined;

      // If any buffered writers are already closed, activate them each immediately
      for (const closedBufferedWriter of [...this._closedBufferedWriters]) {
        this._closedBufferedWriters.delete(closedBufferedWriter);

        try {
          this._assignActiveWriter(closedBufferedWriter);
        } finally {
          this._activeWriter = undefined;
        }
      }

      // Find a buffered writer and activate it
      let openBufferedWriter: CollatedWriter | undefined = undefined;
      for (const first of this._openBufferedWriters) {
        openBufferedWriter = first;
        break;
      }
      if (openBufferedWriter) {
        this._assignActiveWriter(openBufferedWriter);
      }
    } else {
      if (writer.bufferedChunks.length > 0) {
        this._openBufferedWriters.delete(writer);
        this._closedBufferedWriters.add(writer);
      }
    }
  }

  private _assignActiveWriter(writer: CollatedWriter): void {
    this._activeWriter = writer;

    this._openBufferedWriters.delete(writer);

    if (this._onWriterActive) {
      this._preventReentrantCall = true;
      try {
        this._onWriterActive(writer);
      } finally {
        this._preventReentrantCall = false;
      }
    }

    writer.flushBufferedChunks();
  }

  private _checkForReentrantCall(): void {
    if (this._preventReentrantCall) {
      throw new InternalError('Reentrant call to StreamCollator');
    }
  }
}
