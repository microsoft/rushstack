// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';
import type { TerminalWritable, ITerminalChunk } from '@rushstack/terminal';

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
  #taskNames: Set<string> = new Set();
  #writers: Set<CollatedWriter> = new Set();

  // The writer whose output is being shown in realtime, or undefined if none
  #activeWriter: CollatedWriter | undefined = undefined;

  // Writers that are not closed yet, and have never been active
  #openInactiveWriters: Set<CollatedWriter> = new Set();

  // Writers that are now closed, but have accumulated buffered chunks, and have never been active
  #closedInactiveWriters: Set<CollatedWriter> = new Set();

  #onWriterActive: ((writer: CollatedWriter) => void) | undefined;

  #preventReentrantCall: boolean = false;

  public readonly destination: TerminalWritable;
  public readonly terminal: CollatedTerminal;

  public constructor(options: IStreamCollatorOptions) {
    this.destination = options.destination;
    this.terminal = new CollatedTerminal(this.destination);
    this.#onWriterActive = options.onWriterActive;
  }

  /**
   * Returns the currently active `CollatedWriter`, or `undefined` if no writer
   * is active yet.
   */
  public get activeWriter(): CollatedWriter | undefined {
    return this.#activeWriter;
  }

  /**
   * For diagnostic purposes, returns the {@link CollatedWriter.taskName} for the
   * currently active writer, or an empty string if no writer is active.
   */
  public get activeTaskName(): string {
    if (this.#activeWriter) {
      return this.#activeWriter.taskName;
    }
    return '';
  }

  /**
   * The list of writers that have been registered by calling {@link StreamCollator.registerTask},
   * in the order that they were registered.
   */
  public get writers(): ReadonlySet<CollatedWriter> {
    return this.#writers;
  }

  /**
   * Registers a new task to be collated, and constructs a {@link CollatedWriter} object
   * to receive its input.
   */
  public registerTask(taskName: string): CollatedWriter {
    if (this.#taskNames.has(taskName)) {
      throw new Error('A task with that name has already been registered');
    }

    const writer: CollatedWriter = new CollatedWriter(taskName, this);

    this.#writers.add(writer);
    this.#taskNames.add(writer.taskName);

    // When a task is initially registered, it is open and has not accumulated any buffered chunks
    this.#openInactiveWriters.add(writer);

    if (this.#activeWriter === undefined) {
      // If there is no active writer, then the first one to be registered becomes active.
      this.#assignActiveWriter(writer);
    }

    return writer;
  }

  /** @internal */
  public _writerWriteChunk(
    writer: CollatedWriter,
    chunk: ITerminalChunk,
    bufferedChunks: ITerminalChunk[]
  ): void {
    this.#checkForReentrantCall();

    if (this.#activeWriter === undefined) {
      // If no writer is currently active, then the first one to write something becomes active
      this.#assignActiveWriter(writer);
    }

    if (writer.isActive) {
      this.destination.writeChunk(chunk);
    } else {
      bufferedChunks.push(chunk);
    }
  }

  /** @internal */
  public _writerClose(writer: CollatedWriter, bufferedChunks: ITerminalChunk[]): void {
    this.#checkForReentrantCall();

    if (writer.isActive) {
      writer._flushBufferedChunks();

      this.#activeWriter = undefined;

      // If any buffered writers are already closed, activate them each immediately
      // We copy the set, since _assignActiveWriter() will be deleting from it.
      for (const closedInactiveWriter of [...this.#closedInactiveWriters]) {
        try {
          this.#assignActiveWriter(closedInactiveWriter);
        } finally {
          this.#activeWriter = undefined;
        }
      }

      let writerToActivate: CollatedWriter | undefined = undefined;

      // Try to activate a writer that already accumulated some data
      for (const openInactiveWriter of this.#openInactiveWriters) {
        if (openInactiveWriter.bufferedChunks.length > 0) {
          writerToActivate = openInactiveWriter;
          break;
        }
      }
      if (!writerToActivate) {
        // Otherwise just take the first one
        for (const openInactiveWriter of this.#openInactiveWriters) {
          writerToActivate = openInactiveWriter;
          break;
        }
      }

      if (writerToActivate) {
        this.#assignActiveWriter(writerToActivate);
      }
    } else {
      this.#openInactiveWriters.delete(writer);
      this.#closedInactiveWriters.add(writer);
    }
  }

  #assignActiveWriter(writer: CollatedWriter): void {
    this.#activeWriter = writer;

    this.#closedInactiveWriters.delete(writer);
    this.#openInactiveWriters.delete(writer);

    if (this.#onWriterActive) {
      this.#preventReentrantCall = true;
      try {
        this.#onWriterActive(writer);
      } finally {
        this.#preventReentrantCall = false;
      }
    }

    writer._flushBufferedChunks();
  }

  #checkForReentrantCall(): void {
    if (this.#preventReentrantCall) {
      throw new InternalError('Reentrant call to StreamCollator');
    }
  }
}
