// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text, NewlineKind } from '@rushstack/node-core-library';
import { CharMatcher, CharMatcherState } from './CharMatcher';

interface INormalizeNewlinesCharMatcherState {
  characterToIgnore: string;
  incompleteLine: boolean;
}

/** @beta */
export interface INormalizeNewlinesCharMatcherOptions {
  newlineKind: NewlineKind;
  ensureNewlineAtEnd?: boolean;
}

/** @beta */
export class NormalizeNewlinesCharMatcher extends CharMatcher {
  public readonly newlineKind: NewlineKind;
  public readonly newline: string;
  public readonly ensureNewlineAtEnd: boolean;

  public constructor(options: INormalizeNewlinesCharMatcherOptions) {
    super();
    this.newlineKind = options.newlineKind;
    this.newline = Text.getNewline(options.newlineKind);
    this.ensureNewlineAtEnd = !!options.ensureNewlineAtEnd;
  }

  public initialize(): CharMatcherState {
    return {
      characterToIgnore: '',
      incompleteLine: false
    } as INormalizeNewlinesCharMatcherState;
  }

  public process(unknownState: CharMatcherState, text: string): string {
    const state: INormalizeNewlinesCharMatcherState = unknownState as INormalizeNewlinesCharMatcherState;

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

  public flush(unknownState: CharMatcherState): string {
    const state: INormalizeNewlinesCharMatcherState = unknownState as INormalizeNewlinesCharMatcherState;
    state.characterToIgnore = '';

    if (state.incompleteLine) {
      state.incompleteLine = false;
      return this.newline;
    } else {
      return '';
    }
  }
}
