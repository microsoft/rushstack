// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester } from '@typescript-eslint/rule-tester';

import { getRuleTesterWithoutProject } from './ruleTester';
import { noNullRule } from '../no-null';

const ruleTester: RuleTester = getRuleTesterWithoutProject();

ruleTester.run('no-null', noNullRule, {
  invalid: [
    {
      // Assigning null to a variable
      code: 'let x = null;',
      errors: [{ messageId: 'error-usage-of-null' }]
    },
    {
      // Passing null as a function argument (not Object.create)
      code: 'foo(null);',
      errors: [{ messageId: 'error-usage-of-null' }]
    },
    {
      // Returning null
      code: 'function f() { return null; }',
      errors: [{ messageId: 'error-usage-of-null' }]
    },
    {
      // Using null in a ternary
      code: 'let x = true ? null : undefined;',
      errors: [{ messageId: 'error-usage-of-null' }]
    },
    {
      // Using null as a second argument to Object.create
      code: 'Object.create(proto, null);',
      errors: [{ messageId: 'error-usage-of-null' }]
    },
    {
      // Using null on a different method of Object
      code: 'Object.assign(null);',
      errors: [{ messageId: 'error-usage-of-null' }]
    },
    {
      // Using null with a different object's create method
      code: 'NotObject.create(null);',
      errors: [{ messageId: 'error-usage-of-null' }]
    },
    {
      // Computed property access: Object["create"](null) is NOT exempted
      code: 'Object["create"](null);',
      errors: [{ messageId: 'error-usage-of-null' }]
    }
  ],
  valid: [
    {
      // Comparison with === is allowed
      code: 'if (x === null) {}'
    },
    {
      // Comparison with !== is allowed
      code: 'if (x !== null) {}'
    },
    {
      // Comparison with == is allowed
      code: 'if (x == null) {}'
    },
    {
      // Comparison with != is allowed
      code: 'if (x != null) {}'
    },
    {
      // Object.create(null) is allowed for creating prototype-less dictionary objects
      code: 'const dict = Object.create(null);'
    },
    {
      // Object.create(null) with type annotation
      code: 'const dict: Record<string, number> = Object.create(null);'
    },
    {
      // Object.create(null) inside a function
      code: 'function createDict() { return Object.create(null); }'
    }
  ]
});
