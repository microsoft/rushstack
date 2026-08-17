// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalWritable, type ITerminalChunk } from '@rushstack/terminal';

/**
 * A passive tap in an operation's terminal pipeline that forwards each chunk,
 * tagged with the operation id, to the graph's event sink. Installed upstream
 * of the quiet-mode discard so every byte is observable regardless of the
 * CLI's verbosity flags.
 *
 * @internal
 */
export class OperationChunkTap extends TerminalWritable {
  private readonly _operationId: string;
  private readonly _onChunk: (operationId: string, chunk: ITerminalChunk) => void;

  public constructor(
    operationId: string,
    onChunk: (operationId: string, chunk: ITerminalChunk) => void
  ) {
    super({ preventAutoclose: true });
    this._operationId = operationId;
    this._onChunk = onChunk;
  }

  /** {@inheritDoc @rushstack/terminal#TerminalWritable.onWriteChunk} */
  public onWriteChunk(chunk: ITerminalChunk): void {
    this._onChunk(this._operationId, chunk);
  }
}
