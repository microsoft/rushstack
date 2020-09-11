// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';
import { TerminalWritable, ITerminalChunk } from '@rushstack/terminal';

import { CollatedWriter } from './CollatedWriter';
import { CollatedTerminal } from './CollatedTerminal';

/**
 * Constructor options for {@link StreamCollator}.
 *
 * @beta
 */
export interface IStreamCollatorOptions {
  /**
   * The target {@link @rushstack/terminal#TerminalWritable} object that the
   * {@link StreamCollator} will write its output to.
   */
  destination: TerminalWritable;

  /**
   * An event handler that is called when a {@link CollatedWriter} becomes output,
   * before any of its chunks have been written to the destination.
   *
   * @remarks
   *
   * Each `CollatedWriter` object will become active exactly once
   * before the `StreamCollator` completes.
   */
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

  /**
   * Returns the currently active `CollatedWriter`, or `undefined` if no writer
   * is active yet.
   */
  public get activeWriter(): CollatedWriter | undefined {
    return this._activeWriter;
  }

  /**
   * For diagnostic purposes, returns the {@link CollatedWriter.taskName} for the
   * currently active writer, or an empty string if no writer is active.
   */
  public get activeTaskName(): string {
    if (this._activeWriter) {
      return this._activeWriter.taskName;
    }
    return '';
  }

  /**
   * The list of writers that have been registered by calling {@link StreamCollator.registerTask},
   * in the order that they were registered.
   */
  public get writers(): ReadonlySet<CollatedWriter> {
    return this._writers;
  }

  /**
   * Registers a new task to be collated, and constructs a {@link CollatedWriter} object
   * to receive its input.
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
      writer._flushBufferedChunks();

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

    writer._flushBufferedChunks();
  }

  private _checkForReentrantCall(): void {
    if (this._preventReentrantCall) {
      throw new InternalError('Reentrant call to StreamCollator');
    }
  }
}
