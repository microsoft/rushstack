// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { trimNpmrcFileLines } from '../npmrcUtilities';

describe('npmrcUtilities', () => {
  it(trimNpmrcFileLines.name, () => {
    // Normal
    expect(trimNpmrcFileLines(['var1=${foo}'], {})).toMatchInlineSnapshot(`
Array [
  "; MISSING ENVIRONMENT VARIABLE: var1=\${foo}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo}'], { foo: 'test' })).toMatchInlineSnapshot(`
Array [
  "var1=\${foo}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo-fallback_value}'], {})).toMatchInlineSnapshot(`
Array [
  "var1=\${foo-fallback_value}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo-fallback_value}'], { foo: 'test' })).toMatchInlineSnapshot(`
Array [
  "var1=\${foo-fallback_value}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo:-fallback_value}'], {})).toMatchInlineSnapshot(`
Array [
  "var1=\${foo:-fallback_value}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo:-fallback_value}'], { foo: 'test' })).toMatchInlineSnapshot(`
Array [
  "var1=\${foo:-fallback_value}",
]
`);

    // Multiple environment variables
    expect(trimNpmrcFileLines(['var1=${foo}-${bar}'], { foo: 'test' })).toMatchInlineSnapshot(`
Array [
  "; MISSING ENVIRONMENT VARIABLE: var1=\${foo}-\${bar}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo}-${bar}'], { bar: 'test' })).toMatchInlineSnapshot(`
Array [
  "; MISSING ENVIRONMENT VARIABLE: var1=\${foo}-\${bar}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo}-${bar}'], { foo: 'test', bar: 'test' })).toMatchInlineSnapshot(`
Array [
  "var1=\${foo}-\${bar}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo:-fallback_value}-${bar-fallback_value}'], {}))
      .toMatchInlineSnapshot(`
Array [
  "var1=\${foo:-fallback_value}-\${bar-fallback_value}",
]
`);

    // Multiline
    expect(trimNpmrcFileLines(['var1=${foo}', 'var2=${bar}'], { foo: 'test' })).toMatchInlineSnapshot(`
Array [
  "var1=\${foo}",
  "; MISSING ENVIRONMENT VARIABLE: var2=\${bar}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo}', 'var2=${bar}'], { foo: 'test', bar: 'test' }))
      .toMatchInlineSnapshot(`
Array [
  "var1=\${foo}",
  "var2=\${bar}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo}', 'var2=${bar-fallback_value}'], { foo: 'test' }))
      .toMatchInlineSnapshot(`
Array [
  "var1=\${foo}",
  "var2=\${bar-fallback_value}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo:-fallback_value}', 'var2=${bar-fallback_value}'], {}))
      .toMatchInlineSnapshot(`
Array [
  "var1=\${foo:-fallback_value}",
  "var2=\${bar-fallback_value}",
]
`);

    // Malformed
    expect(trimNpmrcFileLines(['var1=${foo_fallback_value}'], {})).toMatchInlineSnapshot(`
Array [
  "; MISSING ENVIRONMENT VARIABLE: var1=\${foo_fallback_value}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo:fallback_value}'], {})).toMatchInlineSnapshot(`
Array [
  "; MISSING ENVIRONMENT VARIABLE: var1=\${foo:fallback_value}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo:_fallback_value}'], {})).toMatchInlineSnapshot(`
Array [
  "; MISSING ENVIRONMENT VARIABLE: var1=\${foo:_fallback_value}",
]
`);
    expect(trimNpmrcFileLines(['var1=${foo'], {})).toMatchInlineSnapshot(`
Array [
  "var1=\${foo",
]
`);
  });
});
