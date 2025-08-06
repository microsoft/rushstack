// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester, TestCaseError } from '@typescript-eslint/rule-tester';

import { getRuleTesterWithProject } from './ruleTester';
import { noTransitiveDependencyImportsRule, MESSAGE_ID } from '../no-transitive-dependency-imports';

const ruleTester: RuleTester = getRuleTesterWithProject();
const expectedErrors: TestCaseError<typeof MESSAGE_ID>[] = [{ messageId: MESSAGE_ID }];

ruleTester.run('no-transitive-dependency-imports', noTransitiveDependencyImportsRule, {
  invalid: [
    // Test variants
    {
      code: "import blah from './node_modules/foo/node_modules/bar'",
      errors: expectedErrors
    },
    {
      code: "import * as blah from './node_modules/foo/node_modules/bar'",
      errors: expectedErrors
    },
    {
      code: "import { blah } from './node_modules/foo/node_modules/bar'",
      errors: expectedErrors
    },
    {
      code: "import { _blah as Blah } from './node_modules/foo/node_modules/bar'",
      errors: expectedErrors
    },
    {
      code: "import blah, { _blah as Blah } from './node_modules/foo/node_modules/bar'",
      errors: expectedErrors
    },
    {
      code: "import blah, * as Blah from './node_modules/foo/node_modules/bar'",
      errors: expectedErrors
    },
    {
      code: "import './node_modules/foo/node_modules/bar'",
      errors: expectedErrors
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./node_modules/foo/node_modules/bar'",
      errors: expectedErrors
    },
    {
      code: "import blah from './node_modules/foo/node_modules/bar?source'",
      errors: expectedErrors
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./node_modules/foo/node_modules/bar?source'",
      errors: expectedErrors
    },
    {
      code: "export * from './node_modules/foo/node_modules/bar'",
      errors: expectedErrors
    },
    // {
    //   code: "export * as blah from './node_modules/foo/node_modules/bar'",
    //   errors: expectedErrors
    // },
    {
      code: "export { blah } from './node_modules/foo/node_modules/bar'",
      errors: expectedErrors
    },
    {
      code: "export { _blah as Blah  } from './node_modules/foo/node_modules/bar'",
      errors: expectedErrors
    },
    {
      code: "export { default } from './node_modules/foo/node_modules/bar'",
      errors: expectedErrors
    },
    // Test async imports
    {
      code: "const blah = await import('./node_modules/foo/node_modules/bar')",
      errors: expectedErrors
    }
  ],
  valid: [
    // Test variants
    {
      code: "import blah from './node_modules/foo'"
    },
    {
      code: "import * as blah from './node_modules/foo'"
    },
    {
      code: "import { blah } from './node_modules/foo'"
    },
    {
      code: "import { _blah as Blah } from './node_modules/foo'"
    },
    {
      code: "import blah, { _blah as Blah } from './node_modules/foo'"
    },
    {
      code: "import blah, * as Blah from './node_modules/foo'"
    },
    {
      code: "import './node_modules/foo'"
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./node_modules/foo'"
    },
    {
      code: "import blah from './node_modules/foo?source'"
    },
    {
      code: "import blah from '!!file-loader?name=image_[name]_[hash:8][ext]!./node_modules/foo?source'"
    },
    {
      code: "export * from './node_modules/foo'"
    },
    // {
    //   code: "export * as blah from './node_modules/foo'"
    // },
    {
      code: "export { blah } from './node_modules/foo'"
    },
    {
      code: "export { _blah as Blah  } from './node_modules/foo'"
    },
    {
      code: "export { default } from './node_modules/foo'"
    },
    // Test async imports
    {
      code: "const blah = await import('./node_modules/foo')"
    }
  ]
});
