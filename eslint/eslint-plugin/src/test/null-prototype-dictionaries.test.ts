// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester } from '@typescript-eslint/rule-tester';

import { getRuleTesterWithProject } from './ruleTester';
import { nullPrototypeDictionariesRule } from '../null-prototype-dictionaries';

const ruleTester: RuleTester = getRuleTesterWithProject();

ruleTester.run('null-prototype-dictionaries', nullPrototypeDictionariesRule, {
  invalid: [
    {
      // Empty object literal assigned to Record<string, number>
      code: 'const dict: Record<string, number> = {};',
      errors: [{ messageId: 'error-empty-object-literal-dictionary' }]
    },
    {
      // Empty object literal assigned to index signature type
      code: 'const dict: { [key: string]: number } = {};',
      errors: [{ messageId: 'error-empty-object-literal-dictionary' }]
    },
    {
      // Reassignment to empty object literal
      code: [
        'let dict: Record<string, number>;',
        'dict = {};'
      ].join('\n'),
      errors: [{ messageId: 'error-empty-object-literal-dictionary' }]
    },
    {
      // Return value from function
      code: 'function f(): Record<string, number> { return {}; }',
      errors: [{ messageId: 'error-empty-object-literal-dictionary' }]
    },
    {
      // Non-empty object literal without __proto__: null
      code: 'const dict: Record<string, string> = { a: "hello" };',
      errors: [{ messageId: 'error-missing-null-prototype' }]
    },
    {
      // Non-empty object literal with __proto__ set to something other than null
      code: 'const dict: Record<string, string> = { __proto__: Object.prototype, a: "hello" };',
      errors: [{ messageId: 'error-missing-null-prototype' }]
    }
  ],
  valid: [
    {
      // Correct pattern: Object.create(null) for empty dictionary
      code: 'const dict: Record<string, number> = Object.create(null);'
    },
    {
      // Correct pattern: non-empty literal with __proto__: null
      code: 'const dict: Record<string, string> = { __proto__: null, a: "hello" };'
    },
    {
      // Regular object type with named properties (not a dictionary)
      code: 'const obj: { name: string } = { name: "hello" };'
    },
    {
      // No explicit dictionary type annotation
      code: 'const obj = {};'
    },
    {
      // Record with literal union key type resolves to named properties, not a dictionary
      code: 'const obj: Record<"a" | "b", number> = { a: 1, b: 2 };'
    },
    {
      // Interface with named properties AND index signature is not a pure dictionary
      code: [
        'interface IExtended { name: string; [key: string]: string }',
        'const obj: IExtended = { name: "hello" };'
      ].join('\n')
    },
    {
      // Non-object-literal initializer is fine
      code: [
        'function getDict(): Record<string, number> { return Object.create(null); }',
        'const dict: Record<string, number> = getDict();'
      ].join('\n')
    }
  ]
});
