// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RuleTester } from '@typescript-eslint/rule-tester';
import { noUntypedUnderscoreRule } from '../no-untyped-underscore';

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    sourceType: 'module',
    // Do not run under 'lib" folder
    tsconfigRootDir: __dirname + '/../../src/test/fixtures',
    project: './tsconfig.json'
  }
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
