// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminalChunk, TerminalChunkKind } from './ITerminalChunk.ts';
import { TerminalTransform, type ITerminalTransformOptions } from './TerminalTransform.ts';

/**
 * Constructor options for {@link DiscardStdoutTransform}
 *
 * @beta
 */
export interface IDiscardStdoutTransformOptions extends ITerminalTransformOptions {}

enum State {
  Okay,
  StderrFragment,
  InsertLinefeed
}

/**
 * `DiscardStdoutTransform` discards `stdout` chunks while fixing up malformed `stderr` lines.
 *
 * @remarks
 * Suppose that a poorly behaved process produces output like this:
 *
 * ```ts
 * process.stdout.write('Starting operation...\n');
 * process.stderr.write('An error occurred');
 * process.stdout.write('\nFinishing up\n');
 * process.stderr.write('The process completed with errors\n');
 * ```
 *
 * When `stdout` and `stderr` are combined on the console, the mistake in the output would not be noticeable:
 * ```
 * Starting operation...
 * An error occurred
 * Finishing up
 * The process completed with errors
 * ```
 *
 * However, if we discard `stdout`, then `stderr` is missing a newline:
 * ```
 * An error occurredThe process completed with errors
 * ```
 *
 * Tooling scripts can introduce these sorts of problems via edge cases that are difficult to find and fix.
 * `DiscardStdoutTransform` can discard the `stdout` stream and fix up `stderr`:
 *
 * ```
 * An error occurred
 * The process completed with errors
 * ```
 *
 * @privateRemarks
 * This class is experimental and marked as `@beta`.  The algorithm may need some fine-tuning, or there may
 * be better solutions to this problem.
 *
 * @beta
 */
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

      if (correctedText.length > 0) {
        if (correctedText[correctedText.length - 1] === '\n') {
          this._state = State.Okay;
        } else {
          this._state = State.StderrFragment;
        }
      }
    } else {
      this.destination.writeChunk(chunk);
    }
  }
}
