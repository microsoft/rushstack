// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import Token, { TokenType } from '../Token';

/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

describe('Token tests', function (): void {

  describe('Token methods', function (): void {

    it('constructor()', function (): void {
      let token: Token;

      token =  new Token(TokenType.Text, '', 'Some text');
      expect(token.type).toBe(TokenType.Text);
      expect(token.tag).toBe('');
      expect(token.text).toBe('Some text');

      token = new Token(TokenType.BlockTag, '@tagA');
      expect(token.type).toBe(TokenType.BlockTag);
      expect(token.tag).toBe('@tagA');
      expect(token.text).toBe('');

      token = new Token(TokenType.InlineTag, '@link', 'http://www.microsoft.com');
      expect(token.type).toBe(TokenType.InlineTag);
      expect(token.tag).toBe('@link');
      expect(token.text).toBe('http://www.microsoft.com');
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
      expect(errorThrown).toBe(false);

      try {
        token.requireType(TokenType.BlockTag);
      } catch (error) {
        errorThrown = true;
      }
      expect(errorThrown).toBe(true);
    });
  });
});
