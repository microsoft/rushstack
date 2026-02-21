// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import RawScriptLoader = require('./../RawScriptLoader.ts');

function wrapResult(result: string): string {
  return `var exports = {};
  eval(${result});
  exports;`;
}

describe(RawScriptLoader.name, () => {
  it('follows the Webpack loader interface', () => {
    expect(RawScriptLoader).toBeDefined();
    expect(typeof RawScriptLoader).toEqual('function');
  });

  it('returns a string', () => {
    expect(typeof RawScriptLoader('')).toEqual('string');
  });

  it('correctly sets exported objects', () => {
    const testScript: string = 'var x = 123; this.exportedObject = x;';
    // eslint-disable-next-line no-eval
    const exports: { exportedObject: number } = eval(wrapResult(RawScriptLoader(testScript)));
    expect(exports.exportedObject).toEqual(123);
  });
});
