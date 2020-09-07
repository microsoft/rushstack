// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalChunk } from './ITerminalChunk';
import { TerminalWritable } from './TerminalWritable';

/** @beta */
export class MockWritable extends TerminalWritable {
  public readonly chunks: ITerminalChunk[] = [];

  protected onWriteChunk(chunk: ITerminalChunk): void {
    this.chunks.push(chunk);
  }

  public reset(): void {
    this.chunks.length = 0;
  }

  public getAllOutput(): string {
    return this.chunks.map((x) => x.text).join('');
  }
}
