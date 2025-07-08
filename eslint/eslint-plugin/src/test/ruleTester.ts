// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as parser from '@typescript-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';

export function getRuleTesterWithoutProject(): RuleTester {
  return new RuleTester({
    languageOptions: {
      parser
    }
  });
}

export function getRuleTesterWithProject(): RuleTester {
  return new RuleTester({
    languageOptions: {
      parser,
      parserOptions: {
        sourceType: 'module',
        // Do not run under 'lib" folder
        tsconfigRootDir: `${__dirname}/../../src/test/fixtures`,
        project: './tsconfig.json'
      }
    }
  });
}
