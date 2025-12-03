// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester } from '@typescript-eslint/rule-tester';

import { getRuleTesterWithoutProject } from './ruleTester';
import { noExternalLocalImportsRule } from '../no-external-local-imports';

const ruleTester: RuleTester = getRuleTesterWithoutProject();

// The root in the test cases is the immediate directory
ruleTester.run('no-external-local-imports', noExternalLocalImportsRule, {
  invalid: [
    // Test variants
    {
      code: "import blah from '../foo'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "import * as blah from '../foo'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "import { blah } from '../foo'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "import { _blah as Blah } from '../foo'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "import blah, { _blah as Blah } from '../foo'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "import blah, * as Blah from '../foo'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "import '../foo'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!../foo'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "import blah from '../foo?source'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!../foo?source'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "export * from '../foo'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    // {
    //   code: "export * as blah from '../foo'",
    //   errors: [{ messageId: 'error-external-local-imports' }]
    // },
    {
      code: "export { blah } from '../foo'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "export { _blah as Blah  } from '../foo'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "export { default } from '../foo'",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    // Test importing from outside of tsconfigRootDir
    {
      code: "import blah from '../foo'",
      errors: [{ messageId: 'error-external-local-imports' }],
      filename: `${__dirname}/blah/test.ts`,
      languageOptions: {
        parserOptions: {
          tsconfigRootDir: `${__dirname}/blah`
        }
      }
    },
    // Test async imports
    {
      code: "const blah = await import('../foo')",
      errors: [{ messageId: 'error-external-local-imports' }]
    },
    {
      code: "const blah = await import('../foo')",
      errors: [{ messageId: 'error-external-local-imports' }],
      filename: `${__dirname}/blah/test.ts`,
      languageOptions: {
        parserOptions: {
          tsconfigRootDir: `${__dirname}/blah`
        }
      }
    }
  ],
  valid: [
    // Test variants
    {
      code: "import blah from './foo'"
    },
    {
      code: "import * as blah from './foo'"
    },
    {
      code: "import { blah } from './foo'"
    },
    {
      code: "import { _blah as Blah } from './foo'"
    },
    {
      code: "import blah, { _blah as Blah } from './foo'"
    },
    {
      code: "import blah, * as Blah from './foo'"
    },
    {
      code: "import './foo'"
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./foo'"
    },
    {
      code: "import blah from './foo?source'"
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./foo?source'"
    },
    {
      code: "export * from './foo'"
    },
    // {
    //   code: "export * as blah from './foo'"
    // },
    {
      code: "export { blah } from './foo'"
    },
    {
      code: "export { _blah as Blah  } from './foo'"
    },
    {
      code: "export { default } from './foo'"
    },
    // Test that importing vertically within the project is valid
    {
      code: "import blah from '../foo/bar'",
      filename: 'blah2/test.ts'
    },
    {
      code: "import blah from '../../foo/bar'",
      filename: 'blah2/foo3/test.ts'
    },
    // Test async imports
    {
      code: "const blah = await import('./foo')"
    },
    {
      code: "const blah = await import('../foo/bar')",
      filename: 'blah2/test.ts'
    },
    {
      code: "const blah = await import('../../foo/bar')",
      filename: 'blah2/foo3/test.ts'
    }
  ]
});
