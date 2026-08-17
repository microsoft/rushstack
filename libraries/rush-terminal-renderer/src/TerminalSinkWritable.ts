// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminalChunk, TerminalChunkKind, TerminalWritable } from '@rushstack/terminal';

import type { IDaemonRendererTerminal } from './DaemonRendererTerminal';

/**
 * A terminal writable that forwards chunk text to a renderer terminal,
 * preserving the stdout/stderr distinction.
 *
 * @beta
 */
export class TerminalSinkWritable extends TerminalWritable {
  private readonly _terminal: IDaemonRendererTerminal;

  public constructor(terminal: IDaemonRendererTerminal) {
    super({ preventAutoclose: true });
    this._terminal = terminal;
  }

  /** {@inheritDoc @rushstack/terminal#TerminalWritable.onWriteChunk} */
  public onWriteChunk(chunk: ITerminalChunk): void {
    this._terminal.write(chunk.text, chunk.kind === TerminalChunkKind.Stderr ? 'stderr' : 'stdout');
  }
}
