// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminalChunk, TerminalChunkKind, type TerminalWritable } from '@rushstack/terminal';

/**
 * This API was introduced as a temporary measure.
 * @deprecated Very soon we plan to replace this with the `Terminal` API from `@rushstack/node-core-library`.
 * @beta
 */
export class CollatedTerminal {
  private readonly _destination: TerminalWritable;

  public constructor(destination: TerminalWritable) {
    this._destination = destination;
  }

  public writeChunk(chunk: ITerminalChunk): void {
    this._destination.writeChunk(chunk);
  }

  public writeStdoutLine(message: string): void {
    this._destination.writeChunk({ text: message + '\n', kind: TerminalChunkKind.Stdout });
  }

  public writeStderrLine(message: string): void {
    this._destination.writeChunk({ text: message + '\n', kind: TerminalChunkKind.Stderr });
  }
}
