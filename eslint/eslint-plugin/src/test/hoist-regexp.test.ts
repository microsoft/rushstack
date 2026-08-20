// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester } from '@typescript-eslint/rule-tester';

import { hoistRegExpRule } from '../hoist-regexp';
import { getRuleTesterWithProject } from './ruleTester';

const ruleTester: RuleTester = getRuleTesterWithProject();

ruleTester.run('hoist-regexp', hoistRegExpRule, {
  valid: [
    "const pattern = /example/;",
    "const pattern = new RegExp('example');",
    'const pattern = RegExp(String.raw`example`);',
    'function getPattern(value: string): RegExp { return new RegExp(value); }',
    'class Example { public pattern: RegExp = /example/; }'
  ],
  invalid: [
    {
      code: 'function matches(value: string): boolean { return /example/.test(value); }',
      errors: [{ messageId: 'hoist-regexp' }]
    },
    {
      code: "const matches = (value: string): boolean => new RegExp('example', 'u').test(value);",
      errors: [{ messageId: 'hoist-regexp' }]
    },
    {
      code: 'function getPattern(): RegExp { return RegExp(`example`); }',
      errors: [{ messageId: 'hoist-regexp' }]
    },
    {
      code: 'for (const value of values) { /example/g.exec(value); }',
      errors: [{ messageId: 'hoist-regexp' }]
    },
    {
      code: 'while (condition) { new RegExp(/example/); }',
      errors: [{ messageId: 'hoist-regexp' }]
    }
  ]
});
