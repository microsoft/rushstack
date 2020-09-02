// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ICollatedChunk, StreamKind } from './CollatedChunk';

/**
 * @public
 */
export type WriteToStreamCallback = (chunk: ICollatedChunk) => void;

/**
 * @public
 */
export class CollatedTerminal {
  private _writeToStream: WriteToStreamCallback;
  public constructor(writeToStream: WriteToStreamCallback) {
    this._writeToStream = writeToStream;
  }

  public writeChunk(chunk: ICollatedChunk): void {
    this._writeToStream(chunk);
  }

  public writeStdoutLine(message: string): void {
    this._writeToStream({ text: message, stream: StreamKind.Stdout });
  }

  public writeStderrLine(message: string): void {
    this._writeToStream({ text: message, stream: StreamKind.Stderr });
  }
}
