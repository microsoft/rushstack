/// <reference types="mocha" />

import { assert } from 'chai';
import Token, { TokenType } from '../Token';

/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

describe('Token tests', function (): void {
  this.timeout(10000);

  describe('Token methods', function (): void {

    it('constructor()', function (): void {
      let token: Token;

      token =  new Token(TokenType.Text, '', 'Some text');
      assert.equal(token.type, TokenType.Text);
      assert.equal(token.tag, '');
      assert.equal(token.text, 'Some text');

      token = new Token(TokenType.Tag, '@tagA');
      assert.equal(token.type, TokenType.Tag);
      assert.equal(token.tag, '@tagA');
      assert.equal(token.text, '');

      token = new Token(TokenType.Inline, '@link', 'http://www.microsoft.com');
      assert.equal(token.type, TokenType.Inline);
      assert.equal(token.tag, '@link');
      assert.equal(token.text, 'http://www.microsoft.com');
    });

  it('RequireType() should raise error', function (): void {
      let token: Token;

      token =  new Token(TokenType.Text, '', 'Some text');
      let errorThrown: boolean = false;
      try {
        token.requireType(TokenType.Text);
      } catch (error) {
        errorThrown = true;
      }
      assert.equal(errorThrown, false);

      try {
        token.requireType(TokenType.Tag);
      } catch (error) {
        errorThrown = true;
      }
      assert.equal(errorThrown, true);
    });
  });
});
