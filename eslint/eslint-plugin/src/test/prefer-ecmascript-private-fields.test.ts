// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester } from '@typescript-eslint/rule-tester';

import { preferEcmascriptPrivateFieldsRule } from '../prefer-ecmascript-private-fields';
import { getRuleTesterWithoutProject } from './ruleTester';

const ruleTester: RuleTester = getRuleTesterWithoutProject();

ruleTester.run('prefer-ecmascript-private-fields', preferEcmascriptPrivateFieldsRule, {
  invalid: [
    {
      code: 'class Example { private value: string = ""; }',
      errors: [{ messageId: 'use-ecmascript-private-field' }]
    },
    {
      code: 'class Example { private static readonly values: Set<string> = new Set(); }',
      errors: [{ messageId: 'use-ecmascript-private-field' }]
    },
    {
      code: 'class Example { private optional?: string; private assigned!: string; }',
      errors: [
        { messageId: 'use-ecmascript-private-field' },
        { messageId: 'use-ecmascript-private-field' }
      ]
    },
    {
      code: 'class Example { declare private value: string; }',
      errors: [{ messageId: 'use-ecmascript-private-field' }]
    },
    {
      code: 'class Example { private ["value"]: string = ""; }',
      errors: [{ messageId: 'use-ecmascript-private-field' }]
    }
  ],
  valid: [
    {
      code: 'class Example { #value: string = ""; static #values: Set<string> = new Set(); }'
    },
    {
      code: 'class Example { public value: string = ""; protected otherValue: string = ""; }'
    },
    {
      code: [
        'class Example {',
        '  private method(): void {}',
        '  private get value(): string { return ""; }',
        '  private set value(value: string) {}',
        '  public constructor(private readonly parameter: string) {}',
        '}'
      ].join('\n')
    }
  ]
});
