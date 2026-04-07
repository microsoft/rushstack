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
      errors: [{ messageId: 'error-object-literal-dictionary' }]
    },
    {
      // Empty object literal assigned to index signature type
      code: 'const dict: { [key: string]: number } = {};',
      errors: [{ messageId: 'error-object-literal-dictionary' }]
    },
    {
      // Non-empty object literal assigned to Record type
      code: 'const dict: Record<string, string> = { a: "hello" };',
      errors: [{ messageId: 'error-object-literal-dictionary' }]
    },
    {
      // Reassignment to empty object literal
      code: [
        'let dict: Record<string, number>;',
        'dict = {};'
      ].join('\n'),
      errors: [{ messageId: 'error-object-literal-dictionary' }]
    },
    {
      // Return value from function
      code: 'function f(): Record<string, number> { return {}; }',
      errors: [{ messageId: 'error-object-literal-dictionary' }]
    }
  ],
  valid: [
    {
      // Correct pattern: Object.create(null) for dictionary
      code: 'const dict: Record<string, number> = Object.create(null);'
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
