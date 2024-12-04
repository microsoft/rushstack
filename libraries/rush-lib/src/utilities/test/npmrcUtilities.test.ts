// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { trimNpmrcFileLines } from '../npmrcUtilities';

describe('npmrcUtilities', () => {
  it(trimNpmrcFileLines.name, () => {
    expect(trimNpmrcFileLines(['var1=${foo}'], {})).toEqual(['; MISSING ENVIRONMENT VARIABLE: var1=${foo}']);
    expect(trimNpmrcFileLines(['var1=${foo}'], { foo: 'test' })).toEqual(['var1=${foo}']);
    expect(trimNpmrcFileLines(['var1=${foo-fallback_value}'], {})).toEqual(['var1=${foo-fallback_value}']);
    expect(trimNpmrcFileLines(['var1=${foo-fallback_value}'], { foo: 'test' })).toEqual([
      'var1=${foo-fallback_value}'
    ]);
    expect(trimNpmrcFileLines(['var1=${foo:-fallback_value}'], {})).toEqual(['var1=${foo:-fallback_value}']);
    expect(trimNpmrcFileLines(['var1=${foo:-fallback_value}'], { foo: 'test' })).toEqual([
      'var1=${foo:-fallback_value}'
    ]);
  });
});
