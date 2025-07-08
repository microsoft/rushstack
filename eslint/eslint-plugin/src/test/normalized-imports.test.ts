// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester, TestCaseError } from '@typescript-eslint/rule-tester';

import { getRuleTesterWithoutProject } from './ruleTester';
import { normalizedImportsRule, MESSAGE_ID } from '../normalized-imports';

const ruleTester: RuleTester = getRuleTesterWithoutProject();

const expectedErrors: TestCaseError<typeof MESSAGE_ID>[] = [{ messageId: MESSAGE_ID }];

// The root in the test cases is the immediate directory
ruleTester.run('normalized-imports', normalizedImportsRule, {
  invalid: [
    // Test variants
    {
      code: "import blah from './foo/../foo/bar'",
      errors: expectedErrors,
      output: "import blah from './foo/bar'"
    },
    {
      code: "import * as blah from './foo/../foo/bar'",
      errors: expectedErrors,
      output: "import * as blah from './foo/bar'"
    },
    {
      code: "import { blah } from './foo/../foo/bar'",
      errors: expectedErrors,
      output: "import { blah } from './foo/bar'"
    },
    {
      code: "import { _blah as Blah } from './foo/../foo/bar'",
      errors: expectedErrors,
      output: "import { _blah as Blah } from './foo/bar'"
    },
    {
      code: "import blah, { _blah as Blah } from './foo/../foo/bar'",
      errors: expectedErrors,
      output: "import blah, { _blah as Blah } from './foo/bar'"
    },
    {
      code: "import blah, * as Blah from './foo/../foo/bar'",
      errors: expectedErrors,
      output: "import blah, * as Blah from './foo/bar'"
    },
    {
      code: "import './foo/../foo/bar'",
      errors: expectedErrors,
      output: "import './foo/bar'"
    },
    // While directory imports aren't ideal, especially from the immediate directory, the path is normalized
    {
      code: "import blah from './'",
      errors: expectedErrors,
      output: "import blah from '.'"
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./foo/../foo/bar'",
      errors: expectedErrors,
      output: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./foo/bar'"
    },
    {
      code: "import blah from './foo/../foo/bar?source'",
      errors: expectedErrors,
      output: "import blah from './foo/bar?source'"
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./foo/../foo/bar?source'",
      errors: expectedErrors,
      output: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./foo/bar?source'"
    },
    {
      code: "export * from './foo/../foo/bar'",
      errors: expectedErrors,
      output: "export * from './foo/bar'"
    },
    // {
    //   code: "export * as blah from './foo/../foo/bar'",
    //   errors: expectedErrors,
    //   output: "export * as blah from './foo/bar'"
    // },
    {
      code: "export { blah } from './foo/../foo/bar'",
      errors: expectedErrors,
      output: "export { blah } from './foo/bar'"
    },
    {
      code: "export { _blah as Blah  } from './foo/../foo/bar'",
      errors: expectedErrors,
      output: "export { _blah as Blah  } from './foo/bar'"
    },
    {
      code: "export { default } from './foo/../foo/bar'",
      errors: expectedErrors,
      output: "export { default } from './foo/bar'"
    },
    // Test leaving and re-entering the current directory
    {
      code: "import blah from '../foo/bar'",
      errors: expectedErrors,
      output: "import blah from './bar'",
      filename: 'foo/test.ts'
    },
    {
      code: "import blah from '../../foo/foo2/bar'",
      errors: expectedErrors,
      output: "import blah from './bar'",
      filename: 'foo/foo2/test.ts'
    },
    {
      code: "import blah from '../../foo/bar'",
      errors: expectedErrors,
      output: "import blah from '../bar'",
      filename: 'foo/foo2/test.ts'
    },
    // Test async imports
    {
      code: "const blah = await import('./foo/../foo/bar')",
      errors: expectedErrors,
      output: "const blah = await import('./foo/bar')"
    },
    {
      code: "const blah = await import('../foo/bar')",
      errors: expectedErrors,
      output: "const blah = await import('./bar')",
      filename: 'foo/test.ts'
    },
    {
      code: "const blah = await import('../../foo/foo2/bar')",
      errors: expectedErrors,
      output: "const blah = await import('./bar')",
      filename: 'foo/foo2/test.ts'
    },
    {
      code: "const blah = await import('../../foo/bar')",
      errors: expectedErrors,
      output: "const blah = await import('../bar')",
      filename: 'foo/foo2/test.ts'
    }
  ],
  valid: [
    // Test variants
    {
      code: "import blah from './foo/bar'"
    },
    {
      code: "import * as blah from './foo/bar'"
    },
    {
      code: "import { blah } from './foo/bar'"
    },
    {
      code: "import { _blah as Blah } from './foo/bar'"
    },
    {
      code: "import blah, { _blah as Blah } from './foo/bar'"
    },
    {
      code: "import blah, * as Blah from './foo/bar'"
    },
    {
      code: "import './foo/bar'"
    },
    // While directory imports aren't ideal, especially from the immediate directory, the path is normalized
    {
      code: "import blah from '.'"
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./foo/bar'"
    },
    {
      code: "import blah from './foo/bar?source'"
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./foo/bar?source'"
    },
    {
      code: "export * from './foo/bar'"
    },
    // {
    //   code: "export * as blah from './foo/bar'"
    // },
    {
      code: "export { blah } from './foo/bar'"
    },
    {
      code: "export { _blah as Blah  } from './foo/bar'"
    },
    {
      code: "export { default } from './foo/bar'"
    },
    // Test that importing vertically is valid
    {
      code: "import blah from '../foo/bar'",
      filename: 'foo2/test.ts'
    },
    {
      code: "import blah from '../../foo/bar'",
      filename: 'foo2/foo3/test.ts'
    },
    // Test async imports
    {
      code: "const blah = await import('./foo/bar')"
    },
    {
      code: "const blah = await import('../foo/bar')",
      filename: 'foo2/test.ts'
    },
    {
      code: "const blah = import('../../foo/bar')",
      filename: 'foo2/foo3/test.ts'
    }
  ]
});
