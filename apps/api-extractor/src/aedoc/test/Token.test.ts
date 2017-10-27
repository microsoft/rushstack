// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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

      token = new Token(TokenType.BlockTag, '@tagA');
      assert.equal(token.type, TokenType.BlockTag);
      assert.equal(token.tag, '@tagA');
      assert.equal(token.text, '');

      token = new Token(TokenType.InlineTag, '@link', 'http://www.microsoft.com');
      assert.equal(token.type, TokenType.InlineTag);
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
        token.requireType(TokenType.BlockTag);
      } catch (error) {
        errorThrown = true;
      }
      assert.equal(errorThrown, true);
    });
  });
});
