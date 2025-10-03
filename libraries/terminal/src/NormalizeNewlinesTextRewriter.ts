// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text, type NewlineKind } from '@rushstack/node-core-library';

import { TextRewriter, type TextRewriterState } from './TextRewriter';

interface INormalizeNewlinesTextRewriterState extends TextRewriterState {
  characterToIgnore: string;
  incompleteLine: boolean;
}

/**
 * Constructor options for {@link NormalizeNewlinesTextRewriter}
 *
 * @public
 */
export interface INormalizeNewlinesTextRewriterOptions {
  /**
   * Specifies how newlines should be represented in the output stream.
   */
  newlineKind: NewlineKind;

  /**
   * If `true`, then `NormalizeNewlinesTextRewriter.close()` will append a newline to
   * the output if it ends with an incomplete line.
   *
   * @remarks
   * If the output is an empty string, then a newline will NOT be appended,
   * because writing an empty string does not produce an incomplete line.
   */
  ensureNewlineAtEnd?: boolean;
}

/**
 * For use with {@link TextRewriterTransform}, this rewriter converts all newlines to
 * a standard format.
 *
 * @public
 */
export class NormalizeNewlinesTextRewriter extends TextRewriter {
  /** {@inheritDoc INormalizeNewlinesTextRewriterOptions.newlineKind} */
  public readonly newlineKind: NewlineKind;

  /**
   * The specific character sequence that will be used when appending newlines.
   */
  public readonly newline: string;

  /** {@inheritDoc INormalizeNewlinesTextRewriterOptions.ensureNewlineAtEnd} */
  public readonly ensureNewlineAtEnd: boolean;

  public constructor(options: INormalizeNewlinesTextRewriterOptions) {
    super();
    this.newlineKind = options.newlineKind;
    this.newline = Text.getNewline(options.newlineKind);
    this.ensureNewlineAtEnd = !!options.ensureNewlineAtEnd;
  }

  public initialize(): TextRewriterState {
    return {
      characterToIgnore: '',
      incompleteLine: false
    } as INormalizeNewlinesTextRewriterState;
  }

  public process(unknownState: TextRewriterState, text: string): string {
    const state: INormalizeNewlinesTextRewriterState = unknownState as INormalizeNewlinesTextRewriterState;

    let result: string = '';

    if (text.length > 0) {
      let i: number = 0;

      do {
        const c: string = text[i];
        ++i;

        if (c === state.characterToIgnore) {
          state.characterToIgnore = '';
        } else if (c === '\r') {
          result += this.newline;
          state.characterToIgnore = '\n';
          state.incompleteLine = false;
        } else if (c === '\n') {
          result += this.newline;
          state.characterToIgnore = '\r';
          state.incompleteLine = false;
        } else {
          result += c;
          state.characterToIgnore = '';
          state.incompleteLine = true;
        }
      } while (i < text.length);
    }

    return result;
  }

  public close(unknownState: TextRewriterState): string {
    const state: INormalizeNewlinesTextRewriterState = unknownState as INormalizeNewlinesTextRewriterState;
    state.characterToIgnore = '';

    if (state.incompleteLine) {
      state.incompleteLine = false;
      return this.newline;
    } else {
      return '';
    }
  }
}
