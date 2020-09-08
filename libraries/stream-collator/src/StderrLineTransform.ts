// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text, NewlineKind } from '@rushstack/node-core-library';

import { ITerminalChunk, TerminalChunkKind } from './ITerminalChunk';
import { TerminalTransform, ITerminalTransformOptions } from './TerminalTransform';
import { CharMatcherTransform } from './CharMatcherTransform';
import { CallbackWritable } from './CallbackWritable';

/** @beta */
export interface IStderrLineTransformOptions extends ITerminalTransformOptions {
  newlineKind?: NewlineKind;
}

/** @beta */
export class StderrLineTransform extends TerminalTransform {
  private _newlineNormalizerTransform: CharMatcherTransform;

  private _accumulatedLine: string;
  private _accumulatedStderr: boolean;

  public readonly newline: string;

  public constructor(options: IStderrLineTransformOptions) {
    super(options);

    this._accumulatedLine = '';
    this._accumulatedStderr = false;

    this.newline = Text.getNewline(options.newlineKind || NewlineKind.Lf);

    // The _newlineNormalizerTransform is applied first to convert newlines to "\n"
    this._newlineNormalizerTransform = new CharMatcherTransform({
      destination: new CallbackWritable({
        onWriteChunk: (chunk: ITerminalChunk): void => {
          this._onWriteNormalizedChunk(chunk);
        },
        onClose: (): void => {}
      }),
      normalizeNewlines: NewlineKind.Lf
    });
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    this._newlineNormalizerTransform.writeChunk(chunk);
  }

  private _onWriteNormalizedChunk(chunk: ITerminalChunk): void {
    // After _newlineNormalizerTransform was applied, we can now assume that all newlines
    // use the "\n" string
    const text: string = chunk.text;
    let startIndex: number = 0;

    while (startIndex < text.length) {
      if (chunk.kind === TerminalChunkKind.Stderr) {
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
    this._newlineNormalizerTransform.close();

    if (this._accumulatedLine.length > 0) {
      this._processAccumulatedLine();
    }
    this.destination.close();
  }

  private _processAccumulatedLine(): void {
    this._accumulatedLine += this.newline;

    if (this._accumulatedStderr) {
      this.destination.writeChunk({
        kind: TerminalChunkKind.Stderr,
        text: this._accumulatedLine
      });
    } else {
      this.destination.writeChunk({
        kind: TerminalChunkKind.Stdout,
        text: this._accumulatedLine
      });
    }

    this._accumulatedLine = '';
    this._accumulatedStderr = false;
  }
}
