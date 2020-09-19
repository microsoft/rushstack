// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { noUnsafeRegExp } from './no-unsafe-regexp';

const { RuleTester } = ESLintUtils;
const ruleTester = new RuleTester({
  parser: '@typescript-eslint/parser'
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
