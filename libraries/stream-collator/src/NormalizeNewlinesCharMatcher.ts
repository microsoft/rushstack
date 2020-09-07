// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text, NewlineKind } from '@rushstack/node-core-library';
import { CharMatcher, CharMatcherState } from './CharMatcher';

interface INormalizeNewlinesCharMatcherState {
  characterToIgnore: string;
}

/** @beta */
export class NormalizeNewlinesCharMatcher extends CharMatcher {
  public readonly newlineKind: NewlineKind;
  public readonly newline: string;

  public constructor(newlineKind: NewlineKind) {
    super();
    this.newlineKind = newlineKind;
    this.newline = Text.getNewline(newlineKind);
  }

  public initialize(): CharMatcherState {
    return { characterToIgnore: '' } as INormalizeNewlinesCharMatcherState;
  }

  public process(unknownState: CharMatcherState, text: string): string {
    const state: INormalizeNewlinesCharMatcherState = unknownState as INormalizeNewlinesCharMatcherState;

    let result: string = '';

    for (let i: number = 0; i < text.length; ++i) {
      const c: string = text[i];

      if (c === state.characterToIgnore) {
        state.characterToIgnore = '';
      } else if (c === '\r') {
        result += this.newline;
        state.characterToIgnore = '\n';
      } else if (c === '\n') {
        result += this.newline;
        state.characterToIgnore = '\r';
      } else {
        result += c;
        state.characterToIgnore = '';
      }
    }

    return result;
  }

  public flush(unknownState: CharMatcherState): string {
    const state: INormalizeNewlinesCharMatcherState = unknownState as INormalizeNewlinesCharMatcherState;
    state.characterToIgnore = '';
    return '';
  }
}
