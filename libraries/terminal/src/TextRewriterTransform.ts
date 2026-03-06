// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { NewlineKind } from '@rushstack/node-core-library';

import { type ITerminalChunk, TerminalChunkKind } from './ITerminalChunk.ts';
import { TerminalTransform, type ITerminalTransformOptions } from './TerminalTransform.ts';
import type { TextRewriter, TextRewriterState } from './TextRewriter.ts';
import { RemoveColorsTextRewriter } from './RemoveColorsTextRewriter.ts';
import { NormalizeNewlinesTextRewriter } from './NormalizeNewlinesTextRewriter.ts';

/**
 * Constructor options for {@link TextRewriterTransform}.
 *
 * @public
 */
export interface ITextRewriterTransformOptions extends ITerminalTransformOptions {
  /**
   * A list of rewriters to be applied.  More items may be appended to the list, for example
   * if {@link ITextRewriterTransformOptions.removeColors} is specified.
   *
   * @remarks
   * The final list must contain at least one item.
   */
  textRewriters?: TextRewriter[];

  /**
   * If specified, a {@link RemoveColorsTextRewriter} will be appended to the list of rewriters.
   */
  removeColors?: boolean;

  /**
   * If `normalizeNewlines` or `ensureNewlineAtEnd` is specified, a {@link NormalizeNewlinesTextRewriter}
   * will be appended to the list of rewriters with the specified settings.
   *
   * @remarks
   * See {@link INormalizeNewlinesTextRewriterOptions} for details.
   */
  normalizeNewlines?: NewlineKind;

  /**
   * If `normalizeNewlines` or `ensureNewlineAtEnd` is specified, a {@link NormalizeNewlinesTextRewriter}
   * will be appended to the list of rewriters with the specified settings.
   *
   * @remarks
   * See {@link INormalizeNewlinesTextRewriterOptions} for details.
   */
  ensureNewlineAtEnd?: boolean;
}

/**
 * A {@link TerminalTransform} subclass that performs one or more {@link TextRewriter} operations.
 * The most common operations are {@link NormalizeNewlinesTextRewriter} and {@link RemoveColorsTextRewriter}.
 *
 * @remarks
 * The `TextRewriter` operations are applied separately to the `stderr` and `stdout` streams.
 * If multiple {@link ITextRewriterTransformOptions.textRewriters} are configured, they are applied
 * in the order that they appear in the array.
 *
 * @public
 */
export class TextRewriterTransform extends TerminalTransform {
  private readonly _stderrStates: TextRewriterState[];
  private readonly _stdoutStates: TextRewriterState[];

  public readonly textRewriters: ReadonlyArray<TextRewriter>;

  public constructor(options: ITextRewriterTransformOptions) {
    super(options);

    const textRewriters: TextRewriter[] = options.textRewriters || [];

    if (options.removeColors) {
      textRewriters.push(new RemoveColorsTextRewriter());
    }
    if (options.normalizeNewlines) {
      textRewriters.push(
        new NormalizeNewlinesTextRewriter({
          newlineKind: options.normalizeNewlines,
          ensureNewlineAtEnd: options.ensureNewlineAtEnd
        })
      );
    }

    if (textRewriters.length === 0) {
      throw new Error('TextRewriterTransform requires at least one matcher');
    }

    this.textRewriters = textRewriters;

    this._stderrStates = this.textRewriters.map((x) => x.initialize());
    this._stdoutStates = this.textRewriters.map((x) => x.initialize());
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    if (chunk.kind === TerminalChunkKind.Stderr) {
      this._processText(chunk, this._stderrStates);
    } else if (chunk.kind === TerminalChunkKind.Stdout) {
      this._processText(chunk, this._stdoutStates);
    } else {
      this.destination.writeChunk(chunk);
    }
  }

  private _processText(chunk: ITerminalChunk, states: TextRewriterState[]): void {
    let text: string = chunk.text;
    for (let i: number = 0; i < states.length; ++i) {
      if (text.length > 0) {
        text = this.textRewriters[i].process(states[i], text);
      }
    }
    if (text.length > 0) {
      // If possible, avoid allocating a new chunk
      if (text === chunk.text) {
        this.destination.writeChunk(chunk);
      } else {
        this.destination.writeChunk({
          text: text,
          kind: chunk.kind
        });
      }
    }
  }

  private _closeRewriters(states: TextRewriterState[], chunkKind: TerminalChunkKind): void {
    let text: string = '';
    for (let i: number = 0; i < states.length; ++i) {
      if (text.length > 0) {
        text = this.textRewriters[i].process(states[i], text);
      }
      text += this.textRewriters[i].close(states[i]);
    }
    if (text.length > 0) {
      this.destination.writeChunk({
        text: text,
        kind: chunkKind
      });
    }
  }

  protected onClose(): void {
    this._closeRewriters(this._stderrStates, TerminalChunkKind.Stderr);
    this._closeRewriters(this._stdoutStates, TerminalChunkKind.Stdout);

    this.autocloseDestination();
  }
}
