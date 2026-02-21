// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as parser from '@typescript-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { noUnsafeRegExp } from '../no-unsafe-regexp.ts';

const ruleTester = new RuleTester({ languageOptions: { parser } });
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
