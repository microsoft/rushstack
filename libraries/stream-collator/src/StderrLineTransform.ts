// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text, NewlineKind } from '@rushstack/node-core-library';

import { ITerminalChunk, StreamKind } from './ITerminalChunk';
import { TerminalTransform, ITerminalTransformOptions } from './TerminalTransform';

/** @beta */
export interface IStderrLineTransformOptions extends ITerminalTransformOptions {
  newlineKind?: NewlineKind;
}

/** @beta */
export class StderrLineTransform extends TerminalTransform {
  private _accumulatedLine: string;
  private _accumulatedStderr: boolean;

  public readonly newline: string;

  public constructor(options: IStderrLineTransformOptions) {
    super(options);

    this._accumulatedLine = '';
    this._accumulatedStderr = false;

    this.newline = Text.getNewline(options.newlineKind || NewlineKind.Lf);
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    const text: string = Text.convertToLf(chunk.text);
    let startIndex: number = 0;

    while (startIndex < text.length) {
      if (chunk.stream === StreamKind.Stderr) {
        this._accumulatedStderr = true;
      }

      const endIndex: number = text.indexOf('\n', startIndex);
      if (endIndex < 0) {
        // we did not find \n, so simply append
        this._accumulatedLine += text.substring(startIndex);
        break;
      }

      // append everything up to \n
      this._accumulatedLine += text.substring(startIndex, endIndex);

      this._processAccumulatedLine();

      // skip the \n
      startIndex = endIndex + 1;
    }
  }

  protected onClose(): void {
    if (this._accumulatedLine.length > 0) {
      this._processAccumulatedLine();
    }
    this.destination.close();
  }

  private _processAccumulatedLine(): void {
    this._accumulatedLine += this.newline;

    if (this._accumulatedStderr) {
      this.destination.writeChunk({
        stream: StreamKind.Stderr,
        text: this._accumulatedLine
      });
    } else {
      this.destination.writeChunk({
        stream: StreamKind.Stdout,
        text: this._accumulatedLine
      });
    }

    this._accumulatedLine = '';
    this._accumulatedStderr = false;
  }
}
