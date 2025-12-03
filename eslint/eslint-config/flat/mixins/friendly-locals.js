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

const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin
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
      '@typescript-eslint': typescriptEslintPlugin
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
