// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CollatedWriter } from './CollatedWriter';
import { CollatedTerminal } from './CollatedTerminal';
import { TerminalWritable } from './TerminalWritable';

/** @beta */
export interface IStreamCollatorOptions {
  destination: TerminalWritable;
  onSetActiveWriter?: (writer: CollatedWriter | undefined) => void;
}

/**
 * A static class which manages the output of multiple threads.
 *
 * @beta
 */
export class StreamCollator {
  private _taskNames: Set<string> = new Set();
  private _writers: Set<CollatedWriter> = new Set();
  private _activeWriter: CollatedWriter | undefined = undefined;
  private _onSetActiveWriter: ((writer: CollatedWriter) => void) | undefined;

  public readonly destination: TerminalWritable;
  public readonly terminal: CollatedTerminal;

  public constructor(options: IStreamCollatorOptions) {
    this.terminal = new CollatedTerminal(options.destination);
    this._onSetActiveWriter = options.onSetActiveWriter;
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
      this._setActiveWriter(writer);
    }

    return writer;
  }

  /**
   * @internal
   */
  public _setActiveWriter(writer: CollatedWriter | undefined): void {
    this._activeWriter = writer;

    if (this._onSetActiveWriter) {
      this._onSetActiveWriter(writer);
    }
  }
}
