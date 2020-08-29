// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CollatedWriter, IStdioMessage } from './CollatedWriter';

/**
 * @public
 */
export type WriteToStreamCallback<TMessage> = (message: TMessage) => void;

/**
 * @public
 */
export interface IStreamCollatorOptions<TMessage> {
  writeToStream: WriteToStreamCallback<TMessage>;
}

/**
 * A static class which manages the output of multiple threads.
 *
 * @public
 */
export class StreamCollator<TMessage = IStdioMessage> {
  private _taskNames: Set<string> = new Set();
  private _writers: Set<CollatedWriter<TMessage>> = new Set();
  private _activeWriter: CollatedWriter<TMessage> | undefined = undefined;

  public readonly writeToStream: WriteToStreamCallback<TMessage>;

  public constructor(options: IStreamCollatorOptions<TMessage>) {
    this.writeToStream = options.writeToStream;
  }

  public get activeWriter(): CollatedWriter<TMessage> | undefined {
    return this._activeWriter;
  }

  public get activeTaskName(): string {
    if (this._activeWriter) {
      return this._activeWriter.taskName;
    }
    return undefined;
  }

  public get writers(): ReadonlySet<CollatedWriter<TMessage>> {
    return this._writers;
  }

  /**
   * Registers a task into the list of active buffers and returns a ITaskWriter for the
   * calling process to use to manage output.
   */
  public registerTask(taskName: string): CollatedWriter<TMessage> {
    if (this._taskNames.has(taskName)) {
      throw new Error('A task with that name has already been registered');
    }

    const writer: CollatedWriter<TMessage> = new CollatedWriter<TMessage>(taskName, this);

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
  public _setActiveWriter(writer: CollatedWriter<TMessage>): void {
    this._activeWriter = writer;
  }
}
