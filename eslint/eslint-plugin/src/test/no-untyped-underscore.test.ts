// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { noUntypedUnderscoreRule } from '../no-untyped-underscore';

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

ruleTester.run('no-untyped-underscore', noUntypedUnderscoreRule, {
  invalid: [
    {
      // prettier-ignore
      code: [
        'let x: any;',
        'x._privateMember = 123;'
      ].join('\n'),
      errors: [{ messageId: 'error-untyped-underscore' }]
    },
    {
      // prettier-ignore
      code: [
        'let x: { [key: string]: number };',
        'x._privateMember = 123;'
      ].join('\n'),
      errors: [{ messageId: 'error-untyped-underscore' }]
    }
  ],
  valid: [
    {
      // prettier-ignore
      code: [
        'let x: { _privateMember: any };',
        'x._privateMember = 123;'
      ].join('\n')
    },
    {
      // prettier-ignore
      code: [
        'let x = { _privateMember: 0 };',
        'x._privateMember = 123;'
      ].join('\n')
    },
    {
      // prettier-ignore
      code: [
        'enum E {',
        '  _PrivateMember',
        '}',
        'let e: E._PrivateMember = E._PrivateMember;'
      ].join('\n')
    }
  ]
});
