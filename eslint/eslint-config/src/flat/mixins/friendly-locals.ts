// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// For the first 5 years of Rush, our lint rules required explicit types for most declarations
// such as function parameters, function return values, and exported variables.  Although more verbose,
// declaring types (instead of relying on type inference) encourages engineers to create interfaces
// that inspire discussions about data structure design.  It also makes source files easier
// to understand for code reviewers who may be unfamiliar with a particular project.  Once developers get
// used to the extra work of declaring types, it turns out to be a surprisingly popular practice.
//
// However in 2020, to make adoption easier for existing projects, this rule was relaxed.  Explicit
// type declarations are now optional for local variables (although still required in other contexts).
// See this GitHub issue for background:
//
//  https://github.com/microsoft/rushstack/issues/2206
//
// If you are onboarding a large existing code base, this new default will make adoption easier.
//
// On the other hand, if your top priority is to make source files more friendly for other
// people to read, enable the "@rushstack/eslint-config/mixins/friendly-locals" mixin.
// It will restore the requirement that local variables should have explicit type declarations.
//
// IMPORTANT: Mixins must be included in your ESLint configuration AFTER the profile

import type { ESLint, Linter } from 'eslint';
import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin';

// The third-party @typescript-eslint plugin does not present itself as an `ESLint.Plugin` (its typescript-eslint
// `RuleModule` types are intentionally not assignable to ESLint's `RuleDefinition`), so widen it through
// `object` to reference it in a flat-config `plugins` map.
const typescriptEslintPluginAsEslintPlugin: ESLint.Plugin = typescriptEslintPlugin as object as ESLint.Plugin;

const config: Linter.Config[] = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': typescriptEslintPluginAsEslintPlugin
    },
    rules: {
      '@rushstack/typedef-var': 'off', // <--- disabled by the mixin

      '@typescript-eslint/typedef': [
        'warn',
        {
          arrayDestructuring: false,
          arrowParameter: false,
          memberVariableDeclaration: true,
          objectDestructuring: false,
          parameter: true,
          propertyDeclaration: true,

          variableDeclaration: true, // <--- reenabled by the mixin

          variableDeclarationIgnoreFunction: true
        }
      ]
    }
  },
  {
    files: [
      // Test files
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',

      // Facebook convention
      '**/__mocks__/**/*.ts',
      '**/__mocks__/**/*.tsx',
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',

      // Microsoft convention
      '**/test/**/*.ts',
      '**/test/**/*.tsx'
    ],
    plugins: {
      '@typescript-eslint': typescriptEslintPluginAsEslintPlugin
    },
    rules: {
      '@typescript-eslint/typedef': [
        'warn',
        {
          arrayDestructuring: false,
          arrowParameter: false,
          memberVariableDeclaration: true,
          objectDestructuring: false,
          parameter: true,
          propertyDeclaration: true,
          variableDeclaration: false, // <--- special case for test files
          variableDeclarationIgnoreFunction: true
        }
      ]
    }
  }
];

export = config;
