// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalChunk, TerminalChunkKind } from './ITerminalChunk';

/**
 * This API was introduced as a temporary measure.
 * @deprecated Very soon we plan to replace this with the `TerminalProvider` API from `@rushstack/node-core-library`.
 * @beta
 */
export type WriteToStreamCallback = (chunk: ITerminalChunk) => void;

/**
 * This API was introduced as a temporary measure.
 * @deprecated Very soon we plan to replace this with the `Terminal` API from `@rushstack/node-core-library`.
 * @beta
 */
export class CollatedTerminal {
  private _writeToStream: WriteToStreamCallback;
  public constructor(writeToStream: WriteToStreamCallback) {
    this._writeToStream = writeToStream;
  }

  public writeChunk(chunk: ITerminalChunk): void {
    this._writeToStream(chunk);
  }

  public writeStdoutLine(message: string): void {
    this._writeToStream({ text: message + '\n', kind: TerminalChunkKind.Stdout });
  }

  public writeStderrLine(message: string): void {
    this._writeToStream({ text: message + '\n', kind: TerminalChunkKind.Stderr });
  }
}
