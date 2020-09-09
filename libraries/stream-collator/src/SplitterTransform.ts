// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalWritable, ITerminalWritableOptions } from './TerminalWritable';
import { ITerminalChunk } from './ITerminalChunk';

/** @beta */
export interface ISplitterTransformOptions extends ITerminalWritableOptions {
  destinations: TerminalWritable[];
}

/** @beta */
export class SplitterTransform extends TerminalWritable {
  public readonly destinations: ReadonlyArray<TerminalWritable>;

  public constructor(options: ISplitterTransformOptions) {
    super();
    this.destinations = [...options.destinations];
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    for (const destination of this.destinations) {
      destination.writeChunk(chunk);
    }
  }

  protected onClose(): void {
    const errors: Error[] = [];

    // If an exception is thrown, try to ensure that the other destinations get closed properly
    for (const destination of this.destinations) {
      if (!destination.preventAutoclose) {
        try {
          destination.close();
        } catch (error) {
          errors.push(error);
        }
      }
    }

    if (errors.length > 0) {
      throw errors[0];
    }
  }
}
