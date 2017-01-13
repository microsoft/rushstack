/// <reference types="mocha" />

import { assert } from 'chai';
import JsonFile from '../JsonFile';
import TestFileComparer from '../TestFileComparer';
import Token from '../Token';
import Tokenizer from '../Tokenizer';

/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

/**
 * Dummy class wrapping Tokenizer to test its protected methods
 */
class TestTokenizer extends Tokenizer {
  constructor(docs: string, reportError: (message: string) => void) {
    super(docs, reportError);
  }

  public tokenizeDocs(docs: string): Token[] {
    return this._tokenizeDocs(docs);
  }

  public tokenizeInline(docs: string): Token {
    return this._tokenizeInline(docs);
  }
}

describe('Tokenizer tests', function (): void {
  this.timeout(10000);

  describe('Tokenizer methods', function (): void {
    const testTokenizer: TestTokenizer = new TestTokenizer('', console.log);

    it('tokenizeDocs()', function (): void {
      const docs: string = `this is a mock documentation\n @taga hi\r\n @tagb hello @invalid@tag email@domain.com
        @tagc this is {   @inlineTag param1  param2   } and this is {just curly braces}`;

      const expectedTokens: Token[] = [
        new Token('Text', '', 'this is a mock documentation'),
        new Token('Tag', '@taga'),
        new Token('Text', '', 'hi'),
        new Token('Tag', '@tagb'),
        new Token('Text', '', 'hello @invalid@tag email@domain.com'),
        new Token('Tag', '@tagc'),
        new Token('Text', '', 'this is'),
        new Token('Text', '', 'and this is {just curly braces}')
      ];

      const actualTokens: Token[] = testTokenizer.tokenizeDocs(docs);
      JsonFile.saveJsonFile('./lib/tokenizeDocsExpected.json', JSON.stringify(expectedTokens));
      JsonFile.saveJsonFile('./lib/tokenizeDocsActual.json', JSON.stringify(actualTokens));
      TestFileComparer.assertFileMatchesExpected('./lib/tokenizeDocsActual.json', './lib/tokenizeDocsExpected.json');
    });

    it('tokenizeInline()', function (): void {
      const token: string = '{    @link   https://bing.com  |  Bing  }';
      const expectedToken: Token = new Token('Inline', '@link', 'https://bing.com | Bing');
      const actualToken: Token = testTokenizer.tokenizeInline(token);
      assert.equal(expectedToken.type, actualToken.type);
      assert.equal(expectedToken.tag, actualToken.tag);
      assert.equal(expectedToken.text, actualToken.text);
    });
  });
});
