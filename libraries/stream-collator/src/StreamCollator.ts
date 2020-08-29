// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CollatedWriter } from './CollatedWriter';

/**
 * A static class which manages the output of multiple threads.
 *
 * @public
 */
export class StreamCollator {
  private _taskNames: Set<string> = new Set();
  private _writers: Set<CollatedWriter> = new Set();
  private _activeWriter: CollatedWriter | undefined = undefined;
  public _stdout: { write: (text: string) => void } = process.stdout;

  public constructor() {}

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
   * Resets the default output stream
   */
  public setStdOut(stdout: { write: (text: string) => void }): void {
    this._stdout = stdout;
  }

  /**
   * Registers a task into the list of active buffers and returns a ITaskWriter for the
   * calling process to use to manage output.
   */
  public registerTask(taskName: string, quietMode: boolean = false): CollatedWriter {
    if (this._taskNames.has(taskName)) {
      throw new Error('A task with that name has already been registered');
    }

    const writer: CollatedWriter = new CollatedWriter(taskName, this, quietMode);

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
