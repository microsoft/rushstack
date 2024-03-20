// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalWritable, type ITerminalWritableOptions } from './TerminalWritable';
import type { ITerminalChunk } from './ITerminalChunk';

/**
 * Constructor options for {@link SplitterTransform}.
 *
 * @public
 */
export interface ISplitterTransformOptions extends ITerminalWritableOptions {
  /**
   * Each input chunk will be passed to each destination in the array.
   */
  destinations: TerminalWritable[];
}

/**
 * Use this instead of {@link TerminalTransform} if you need to output `ITerminalChunk`
 * data to more than one destination.
 *
 * @remarks
 *
 * Splitting streams complicates the pipeline topology and can make debugging more difficult.
 * For this reason, it is modeled as an explicit `SplitterTransform` node, rather than
 * as a built-in feature of `TerminalTransform`.
 *
 * @public
 */
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
          errors.push(error as Error);
        }
      }
    }

    if (errors.length > 0) {
      throw errors[0];
    }
  }
}
