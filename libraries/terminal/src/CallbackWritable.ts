// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalWritable } from './TerminalWritable';
import { ITerminalChunk } from './ITerminalChunk';

/** @beta */
export interface ICallbackWritableOptions {
  onWriteChunk: (chunk: ITerminalChunk) => void;
  onClose: () => void;
}

/** @beta */
export class CallbackWritable extends TerminalWritable {
  private readonly _callback: (chunk: ITerminalChunk) => void;
  private readonly _onClose: (() => void) | undefined;

  public constructor(options: ICallbackWritableOptions) {
    super();
    this._callback = options.onWriteChunk;
    this._onClose = options.onClose;
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    this._callback(chunk);
  }

  protected onClose(): void {
    if (this._onClose) {
      this._onClose();
    }
  }
}
