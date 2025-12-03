// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester, TestCaseError } from '@typescript-eslint/rule-tester';

import { getRuleTesterWithProject } from './ruleTester';
import { noBackslashImportsRule, MESSAGE_ID } from '../no-backslash-imports';

const ruleTester: RuleTester = getRuleTesterWithProject();
const expectedErrors: TestCaseError<typeof MESSAGE_ID>[] = [{ messageId: MESSAGE_ID }];

ruleTester.run('no-backslash-imports', noBackslashImportsRule, {
  invalid: [
    // Test variants
    {
      code: "import blah from '.\\\\foo\\\\bar'",
      errors: expectedErrors,
      output: "import blah from './foo/bar'"
    },
    {
      code: "import * as blah from '.\\\\foo\\\\bar'",
      errors: expectedErrors,
      output: "import * as blah from './foo/bar'"
    },
    {
      code: "import { blah } from '.\\\\foo\\\\bar'",
      errors: expectedErrors,
      output: "import { blah } from './foo/bar'"
    },
    {
      code: "import { _blah as Blah } from '.\\\\foo\\\\bar'",
      errors: expectedErrors,
      output: "import { _blah as Blah } from './foo/bar'"
    },
    {
      code: "import blah, { _blah as Blah } from '.\\\\foo\\\\bar'",
      errors: expectedErrors,
      output: "import blah, { _blah as Blah } from './foo/bar'"
    },
    {
      code: "import blah, * as Blah from '.\\\\foo\\\\bar'",
      errors: expectedErrors,
      output: "import blah, * as Blah from './foo/bar'"
    },
    {
      code: "import '.\\\\foo\\\\bar'",
      errors: expectedErrors,
      output: "import './foo/bar'"
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!.\\\\foo\\\\bar'",
      errors: expectedErrors,
      output: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./foo/bar'"
    },
    {
      code: "import blah from '.\\\\foo\\\\bar?source'",
      errors: expectedErrors,
      output: "import blah from './foo/bar?source'"
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!.\\\\foo\\\\bar?source'",
      errors: expectedErrors,
      output: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./foo/bar?source'"
    },
    {
      code: "export * from '.\\\\foo\\\\bar'",
      errors: expectedErrors,
      output: "export * from './foo/bar'"
    },
    // {
    //   code: "export * as blah from './foo/../foo/bar'",
    //   errors: expectedErrors,
    //   output: "export * as blah from './foo/bar'"
    // },
    {
      code: "export { blah } from '.\\\\foo\\\\bar'",
      errors: expectedErrors,
      output: "export { blah } from './foo/bar'"
    },
    {
      code: "export { _blah as Blah  } from '.\\\\foo\\\\bar'",
      errors: expectedErrors,
      output: "export { _blah as Blah  } from './foo/bar'"
    },
    {
      code: "export { default } from '.\\\\foo\\\\bar'",
      errors: expectedErrors,
      output: "export { default } from './foo/bar'"
    },
    // Test async imports
    {
      code: "const blah = await import('.\\\\foo\\\\bar')",
      errors: expectedErrors,
      output: "const blah = await import('./foo/bar')"
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
    // Test async imports
    {
      code: "const blah = await import('./foo/bar')"
    }
  ]
});
