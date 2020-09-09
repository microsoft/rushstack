// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalChunk, TerminalChunkKind } from './ITerminalChunk';
import { TerminalTransform, ITerminalTransformOptions } from './TerminalTransform';

/** @beta */
export interface IDiscardStdoutTransformOptions extends ITerminalTransformOptions {}

enum State {
  Okay,
  StderrFragment,
  InsertLinefeed
}

/** @beta */
export class DiscardStdoutTransform extends TerminalTransform {
  private _state: State;

  public constructor(options: IDiscardStdoutTransformOptions) {
    super(options);

    this._state = State.Okay;
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    if (chunk.text.indexOf('\r') >= 0) {
      throw new Error('DiscardStdoutTransform expects chunks with normalized newlines');
    }

    if (chunk.kind === TerminalChunkKind.Stdout) {
      if (this._state === State.StderrFragment) {
        if (chunk.text.indexOf('\n') >= 0) {
          this._state = State.InsertLinefeed;
        }
      }
    } else if (chunk.kind === TerminalChunkKind.Stderr) {
      let correctedText: string;
      if (this._state === State.InsertLinefeed) {
        correctedText = '\n' + chunk.text;
      } else {
        correctedText = chunk.text;
      }

      this.destination.writeChunk({ kind: TerminalChunkKind.Stderr, text: correctedText });

      if (correctedText[correctedText.length - 1] === '\n') {
        this._state = State.Okay;
      } else {
        this._state = State.StderrFragment;
      }
    } else {
      this.destination.writeChunk(chunk);
    }
  }
}
