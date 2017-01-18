/// <reference types="mocha" />

import { assert } from 'chai';
import TypeScriptHelpers from '../TypeScriptHelpers';

describe('TypeScriptHelpers tests', () => {

  describe('splitStringWithRegEx()', () => {
    it('simple case', () => {
      assert.deepEqual(
        TypeScriptHelpers.splitStringWithRegEx('ABCDaFG', /A/gi), ['A', 'BCD', 'a', 'FG']
      );
    });

    it('empty match', () => {
      assert.deepEqual(
        TypeScriptHelpers.splitStringWithRegEx('', /A/gi), []
      );
    });

  });

  describe('extractCommentContent()', () => {
    it('multi-line comment', () => {
      assert.equal(
        TypeScriptHelpers.extractCommentContent('/**\n * this is\n * a test\n */\n'),
        'this is\na test');
    });

    it('single-line comment', () => {
      assert.equal(
        TypeScriptHelpers.extractCommentContent('/** single line comment */'),
        'single line comment');
    });

    it('degenerate comment', () => {
      assert.equal(
        TypeScriptHelpers.removeJsDocSequences(
        ['/**', '* degenerate comment', 'star missing here', '* end of comment', '*/']),
        'degenerate comment\nstar missing here\nend of comment');
    });
  });

});
