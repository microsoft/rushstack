// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as parser from '@typescript-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { typedefVar } from '../typedef-var';

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      sourceType: 'module',
      // Do not run under 'lib" folder
      tsconfigRootDir: __dirname + '/../../src/test/fixtures',
      project: './tsconfig.json'
    }
  }
});

ruleTester.run('typedef-var', typedefVar, {
  invalid: [
    {
      code: 'const x = 123;',
      errors: [{ messageId: 'expected-typedef-named' }]
    },
    {
      code: 'let x = 123;',
      errors: [{ messageId: 'expected-typedef-named' }]
    },
    {
      code: 'var x = 123;',
      errors: [{ messageId: 'expected-typedef-named' }]
    },
    {
      code: '{ const x = 123; }',
      errors: [{ messageId: 'expected-typedef-named' }]
    }
  ],
  valid: [
    {
      code: 'function f() { const x = 123; }'
    },
    {
      code: 'const f = () => { const x = 123; };'
    },
    {
      code: 'const f = function() { const x = 123; }'
    },
    {
      code: 'for (const x of []) { }'
    },
    {
      code: 'const x = 1 as const;'
    },
    {
      code: 'const x: 1 = 1;'
    },
    {
      code: 'const x: number = 1;'
    },
    {
      // prettier-ignore
      code: [
        'let { a , b } = {',
        '  a: 123,',
        '  b: 234',
        '}',
      ].join('\n')
    },
    {
      // prettier-ignore
      code: [
        'class C {',
        '  public m(): void {',
        '    const x = 123;',
        '  }',
        '}',
      ].join('\n')
    },
    {
      // prettier-ignore
      code: [
        'class C {',
        '  public m = (): void => {',
        '    const x = 123;',
        '  }',
        '}',
      ].join('\n')
    }
  ]
});
