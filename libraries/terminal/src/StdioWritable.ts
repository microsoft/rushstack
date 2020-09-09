// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as process from 'process';
import { ITerminalChunk, TerminalChunkKind } from './ITerminalChunk';
import { TerminalWritable } from './TerminalWritable';

/** @beta */
export class StdioWritable extends TerminalWritable {
  public static instance: StdioWritable = new StdioWritable();

  protected onWriteChunk(chunk: ITerminalChunk): void {
    if (chunk.kind === TerminalChunkKind.Stdout) {
      process.stdout.write(chunk.text);
    } else if (chunk.kind === TerminalChunkKind.Stderr) {
      process.stderr.write(chunk.text);
    }
  }
}
