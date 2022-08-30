// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { noUnsafeRegExp } from './no-unsafe-regexp';

const { RuleTester } = ESLintUtils;
const ruleTester = new RuleTester({
  /*
   * The underlying API requires an absolute path. `@typescript-eslint/utils` calls `require.resolve()` on the input
   * and forces it to be of type '@typescript-eslint/parser' but does not have a dependency on `@typescript-eslint/parser`
   * This means that it will always fail to resolve in a strict environment.
   * Fortunately `require.resolve(absolutePath)` returns `absolutePath`, so we can resolve it first and cast.
   */
  parser: require.resolve('@typescript-eslint/parser') as '@typescript-eslint/parser'
});

ruleTester.run('no-unsafe-regexp', noUnsafeRegExp, {
  invalid: [
    {
      // prettier-ignore
      code: [
        'function f(s: string) {',
        '  const r1 = new RegExp(s);',
        '}'
      ].join('\n'),
      errors: [{ messageId: 'error-unsafe-regexp' }]
    }
  ],
  valid: [
    {
      code: 'const r1 = new RegExp(".*");'
    }
  ]
});
