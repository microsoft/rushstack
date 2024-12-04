// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { addMissingEnvPrefix, trimNpmrcFileLines } from '../npmrcUtilities';

describe('npmrcUtilities', () => {
  it(trimNpmrcFileLines.name, () => {
    // Normal
    expect(trimNpmrcFileLines(['var1=${foo}'], {})).toEqual([addMissingEnvPrefix('var1=${foo}')]);
    expect(trimNpmrcFileLines(['var1=${foo}'], { foo: 'test' })).toEqual(['var1=${foo}']);
    expect(trimNpmrcFileLines(['var1=${foo-fallback_value}'], {})).toEqual(['var1=${foo-fallback_value}']);
    expect(trimNpmrcFileLines(['var1=${foo-fallback_value}'], { foo: 'test' })).toEqual([
      'var1=${foo-fallback_value}'
    ]);
    expect(trimNpmrcFileLines(['var1=${foo:-fallback_value}'], {})).toEqual(['var1=${foo:-fallback_value}']);
    expect(trimNpmrcFileLines(['var1=${foo:-fallback_value}'], { foo: 'test' })).toEqual([
      'var1=${foo:-fallback_value}'
    ]);

    // Multiple environment variables
    expect(trimNpmrcFileLines(['var1=${foo}-${bar}'], { foo: 'test' })).toEqual([addMissingEnvPrefix('var1=${foo}-${bar}')]);
    expect(trimNpmrcFileLines(['var1=${foo}-${bar}'], { bar: 'test' })).toEqual([addMissingEnvPrefix('var1=${foo}-${bar}')]);
    expect(trimNpmrcFileLines(['var1=${foo}-${bar}'], { foo: 'test', bar: 'test' })).toEqual(['var1=${foo}-${bar}']);
    expect(trimNpmrcFileLines(['var1=${foo:-fallback_value}-${bar-fallback_value}'], {})).toEqual(['var1=${foo:-fallback_value}-${bar-fallback_value}']);

    // Multiline
    expect(trimNpmrcFileLines(['var1=${foo}', 'var2=${bar}'], { foo: 'test' })).toEqual(['var1=${foo}', addMissingEnvPrefix('var2=${bar}')]);
    expect(trimNpmrcFileLines(['var1=${foo}', 'var2=${bar}'], { foo: 'test', bar: 'test' })).toEqual(['var1=${foo}', 'var2=${bar}']);
    expect(trimNpmrcFileLines(['var1=${foo}', 'var2=${bar-fallback_value}'], { foo: 'test' })).toEqual(['var1=${foo}', 'var2=${bar-fallback_value}']);
    expect(trimNpmrcFileLines(['var1=${foo:-fallback_value}', 'var2=${bar-fallback_value}'], {})).toEqual(['var1=${foo:-fallback_value}', 'var2=${bar-fallback_value}']);

    // Malformed
    expect(trimNpmrcFileLines(['var1=${foo_fallback_value}'], {})).toEqual([addMissingEnvPrefix('var1=${foo_fallback_value}')]);
    expect(trimNpmrcFileLines(['var1=${foo:fallback_value}'], {})).toEqual([addMissingEnvPrefix('var1=${foo:fallback_value}')]);
    expect(trimNpmrcFileLines(['var1=${foo:_fallback_value}'], {})).toEqual([addMissingEnvPrefix('var1=${foo:_fallback_value}')]);
    expect(trimNpmrcFileLines(['var1=${foo'], {})).toEqual(['var1=${foo']);
  });
});
