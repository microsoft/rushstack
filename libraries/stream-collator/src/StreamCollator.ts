// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CollatedWriter } from './CollatedWriter';
import { CollatedTerminal, WriteToStreamCallback } from './CollatedTerminal';

/**
 * @public
 */
export interface IStreamCollatorOptions {
  writeToStream: WriteToStreamCallback;
}

/**
 * A static class which manages the output of multiple threads.
 *
 * @public
 */
export class StreamCollator {
  private _taskNames: Set<string> = new Set();
  private _writers: Set<CollatedWriter> = new Set();
  private _activeWriter: CollatedWriter | undefined = undefined;

  public readonly terminal: CollatedTerminal;

  public constructor(options: IStreamCollatorOptions) {
    this.terminal = new CollatedTerminal(options.writeToStream);
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

    if (this._activeWriter === undefined) {
      this._activeWriter = writer;
    }

    return writer;
  }

  /**
   * @internal
   */
  public _setActiveWriter(writer: CollatedWriter): void {
    this._activeWriter = writer;
  }
}
