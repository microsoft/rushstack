// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';
import RawScriptLoader = require('./../RawScriptLoader');

function wrapResult(result: string): string {
  return `var exports = {};
  eval(${result});
  exports;`;
}

describe('RawScriptLoader', () => {
  it('follows the Webpack loader interface', () => {
    assert.isDefined(RawScriptLoader);
    assert.isFunction(RawScriptLoader);
  });

  it('returns a string', () => {
    assert.isString(RawScriptLoader(''));
  });

  it('correctly sets exported objects', () => {
    const testScript: string = 'var x = 123; this.exportedObject = x;';
    /* tslint:disable:no-eval */
    const exports: { exportedObject: number } = eval(wrapResult(RawScriptLoader(testScript)));
    /* tslint:enable:no-eval */
    assert.equal(exports.exportedObject, 123);
  });
});