// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalChunk } from './ITerminalChunk';
import { TerminalWriter } from './TerminalWriter';

/** @beta */
export class TestWriter extends TerminalWriter {
  public readonly chunks: ITerminalChunk[] = [];

  protected onWriteChunk(chunk: ITerminalChunk): void {
    this.chunks.push(chunk);
  }
}
