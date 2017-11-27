// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import TypeScriptHelpers from '../TypeScriptHelpers';

describe('TypeScriptHelpers tests', () => {

  describe('splitStringWithRegEx()', () => {
    it('simple case', () => {
      expect(TypeScriptHelpers.splitStringWithRegEx('ABCDaFG', /A/gi))
        .toEqual(['A', 'BCD', 'a', 'FG']);
    });

    it('empty match', () => {
      expect(TypeScriptHelpers.splitStringWithRegEx('', /A/gi))
        .toEqual([]);
    });

  });

  describe('extractCommentContent()', () => {
    it('multi-line comment', () => {
      expect(TypeScriptHelpers.extractCommentContent('/**\n * this is\n * a test\n */\n'))
        .toBe('this is\na test');
    });

    it('single-line comment', () => {
      expect(TypeScriptHelpers.extractCommentContent('/** single line comment */'))
        .toBe('single line comment');
    });

    it('degenerate comment', () => {
      expect(TypeScriptHelpers.removeJsdocSequences(
        ['/**', '* degenerate comment', 'star missing here', '* end of comment', '*/']))
        .toBe('degenerate comment\nstar missing here\nend of comment');
    });
  });

});
