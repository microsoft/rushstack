// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Linter } from 'eslint';

import type { typeAwareRules } from './profile/_common';

// The profile's type-aware rules, turned off. Typing this as `Record<keyof typeof typeAwareRules, 'off'>` keeps
// it in sync with the typeAwareRules group in ./profile/_common: adding a type-aware rule there becomes a compile
// error until it is disabled here as well.
const disabledTypeAwareRules: Record<keyof typeof typeAwareRules, 'off'> = {
  '@typescript-eslint/naming-convention': 'off',
  '@typescript-eslint/no-floating-promises': 'off',
  '@typescript-eslint/no-for-in-array': 'off'
};

// Returns ESLint flat-config objects that lint the specified files WITHOUT type information: type-aware parsing
// is disabled and the profile's type-aware rules are turned off, leaving only the non-type-aware rules in effect.
//
// Use this for TypeScript files that are selected by your ESLint configuration but are NOT part of the project's
// TypeScript program -- for example configuration files or tests that are not included by tsconfig.json.  Without
// this, typescript-eslint reports a fatal parsing error because it cannot associate those files with the project,
// and any type-aware rule would be unable to run.
//
// IMPORTANT: These config objects must be included in your ESLint configuration AFTER the profile, so that they
// override the profile's type-aware parser options and rules for the specified files.
//
// Example (eslint.config.js):
//
//   const { withoutTypeInformation } = require('@rushstack/eslint-config/flat/without-type-information');
//
//   module.exports = [
//     ...nodeTrustedToolProfile,
//     ...withoutTypeInformation({ files: ['tests/**/*.ts', 'playwright.config.ts'] })
//   ];
interface IWithoutTypeInformationOptions {
  files: string[];
}

function withoutTypeInformation({ files }: IWithoutTypeInformationOptions): Linter.Config[] {
  return [
    {
      files,
      languageOptions: {
        parserOptions: {
          // Disable type-aware parsing so that files outside the TypeScript program do not fail to resolve
          // against it.
          project: false,
          projectService: false
        }
      },
      rules: disabledTypeAwareRules
    }
  ];
}

export { withoutTypeInformation };
