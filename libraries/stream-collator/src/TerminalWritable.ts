// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalChunk } from './ITerminalChunk';

/** @beta */
export abstract class TerminalWritable {
  private _isOpen: boolean;

  public constructor() {
    this._isOpen = true;
  }

  public get isOpen(): boolean {
    return this._isOpen;
  }

  public writeChunk(chunk: ITerminalChunk): void {
    if (!this._isOpen) {
      throw new Error('Writer was already closed');
    }
    this.onWriteChunk(chunk);
  }

  protected abstract onWriteChunk(chunk: ITerminalChunk): void;

  public close(): void {
    if (this._isOpen) {
      this.onClose();
      this._isOpen = false;
    }
  }

  protected onClose(): void {}
}
