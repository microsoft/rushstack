// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester } from '@typescript-eslint/rule-tester';

import { getRuleTesterWithProject } from './ruleTester.ts';
import { importRequiresChunkNameRule } from '../import-requires-chunk-name.ts';

const ruleTester: RuleTester = getRuleTesterWithProject();

ruleTester.run('import-requires-chunk-name', importRequiresChunkNameRule, {
  invalid: [
    {
      code: [
        'import(',
        '  /* webpackChunkName: "my-chunk-name" */',
        '  /* webpackChunkName: "my-chunk-name2" */',
        "  'module'",
        ')'
      ].join('\n'),
      errors: [{ messageId: 'error-import-requires-single-chunk-name' }]
    },
    {
      code: [
        'import(',
        '  // webpackChunkName: "my-chunk-name"',
        '  // webpackChunkName: "my-chunk-name2"',
        "  'module'",
        ')'
      ].join('\n'),
      errors: [{ messageId: 'error-import-requires-single-chunk-name' }]
    },
    {
      code: "import('module')",
      errors: [{ messageId: 'error-import-requires-chunk-name' }]
    }
  ],
  valid: [
    {
      code: 'import(/* webpackChunkName: "my-chunk-name" */\'module\')'
    },
    {
      code: ['import(', '  /* webpackChunkName: "my-chunk-name" */', "  'module'", ')'].join('\n')
    },
    {
      code: ['import(', '  // webpackChunkName: "my-chunk-name"', "  'module'", ')'].join('\n')
    }
  ]
});
