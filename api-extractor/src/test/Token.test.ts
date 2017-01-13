/// <reference types="mocha" />

import { assert } from 'chai';
import Token from '../Token';

/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

describe('Token tests', function (): void {
  this.timeout(10000);

  describe('Token methods', function (): void {

    it('constructor()', function (): void {
      let token: Token;

      token =  new Token('Text', '', 'Some text');
      assert.equal(token.type, 'Text');
      assert.equal(token.tag, '');
      assert.equal(token.text, 'Some text');

      token = new Token('Tag', '@tagA');
      assert.equal(token.type, 'Tag');
      assert.equal(token.tag, '@tagA');
      assert.equal(token.text, '');

      token = new Token('Inline', '@link', 'http://www.microsoft.com');
      assert.equal(token.type, 'Inline');
      assert.equal(token.tag, '@link');
      assert.equal(token.text, 'http://www.microsoft.com');
    });

  it('RequireType() should raise error', function (): void {
      let token: Token;

      token =  new Token('Text', '', 'Some text');
      let errorThrown: boolean = false;
      try {
        token.requireType('Text');
      } catch (error) {
        errorThrown = true;
      }
      assert.equal(errorThrown, false);

      try {
        token.requireType('Tag');
      } catch (error) {
        errorThrown = true;
      }
      assert.equal(errorThrown, true);
    });
  });
});
