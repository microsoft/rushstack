// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester } from '@typescript-eslint/rule-tester';

import { preferEcmascriptPrivateMembersRule } from '../prefer-ecmascript-private-members';
import { getRuleTesterWithoutProject } from './ruleTester';

const ruleTester: RuleTester = getRuleTesterWithoutProject();

ruleTester.run('prefer-ecmascript-private-members', preferEcmascriptPrivateMembersRule, {
  invalid: [
    {
      code: 'class Example { private value: string = ""; }',
      errors: [{ messageId: 'use-ecmascript-private-member' }]
    },
    {
      code: 'class Example { private static readonly values: Set<string> = new Set(); }',
      errors: [{ messageId: 'use-ecmascript-private-member' }]
    },
    {
      code: 'class Example { private optional?: string; private assigned!: string; }',
      errors: [
        { messageId: 'use-ecmascript-private-member' },
        { messageId: 'use-ecmascript-private-member' }
      ]
    },
    {
      code: 'class Example { declare private value: string; }',
      errors: [{ messageId: 'use-ecmascript-private-member' }]
    },
    {
      code: 'class Example { private ["value"]: string = ""; }',
      errors: [{ messageId: 'use-ecmascript-private-member' }]
    },
    {
      code: 'class Example { private calculate(): number { return 1; } }',
      errors: [{ messageId: 'use-ecmascript-private-member' }]
    },
    {
      code: [
        'class Example {',
        '  private get value(): string { return ""; }',
        '  private set value(value: string) {}',
        '}'
      ].join('\n'),
      errors: [
        { messageId: 'use-ecmascript-private-member' },
        { messageId: 'use-ecmascript-private-member' }
      ]
    }
  ],
  valid: [
    {
      code: 'class Example { #value: string = ""; static #values: Set<string> = new Set(); }'
    },
    {
      code: [
        'class Example {',
        '  #calculate(): number { return 1; }',
        '  get #value(): string { return ""; }',
        '  set #value(value: string) {}',
        '}'
      ].join('\n')
    },
    {
      code: 'class Example { public value: string = ""; protected otherValue: string = ""; }'
    },
    {
      code: [
        'class Example {',
        '  public constructor(private readonly parameter: string) {}',
        '}'
      ].join('\n')
    },
    {
      code: 'class Example { private constructor() {} }'
    }
  ]
});
