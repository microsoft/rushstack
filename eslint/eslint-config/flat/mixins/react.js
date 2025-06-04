// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This mixin applies some additional checks for projects using the React library.  For more information,
// please see the README.md for "@rushstack/eslint-config".
//
// IMPORTANT: Mixins must be included in your ESLint configuration AFTER the profile

const reactEslintPlugin = require('eslint-plugin-react');

module.exports = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      react: reactEslintPlugin
    },
    settings: {
      react: {
        // The default value is "detect".  Automatic detection works by loading the entire React library
        // into the linter's process, which is inefficient.  It is recommended to specify the version
        // explicity.  For details, see README.md for "@rushstack/eslint-config".
        version: 'detect'
      }
    },
    rules: {
      // RATIONALE:         When React components are added to an array, they generally need a "key".
      'react/jsx-key': 'warn',

      // RATIONALE:         Catches a common coding practice that significantly impacts performance.
      'react/jsx-no-bind': 'warn',

      // RATIONALE:         Catches a common coding mistake.
      'react/jsx-no-comment-textnodes': 'warn',

      // RATIONALE:         Security risk.
      'react/jsx-no-target-blank': 'warn',

      // RATIONALE:         Fixes the no-unused-vars rule to make it compatible with React
      'react/jsx-uses-react': 'warn',

      // RATIONALE:         Fixes the no-unused-vars rule to make it compatible with React
      'react/jsx-uses-vars': 'warn',

      // RATIONALE:         Catches a common coding mistake.
      'react/no-children-prop': 'warn',

      // RATIONALE:         Catches a common coding mistake.
      'react/no-danger-with-children': 'warn',

      // RATIONALE:         Avoids usage of deprecated APIs.
      //
      // Note that the set of deprecated APIs is determined by the "react.version" setting.
      'react/no-deprecated': 'warn',

      // RATIONALE:         Catches a common coding mistake.
      'react/no-direct-mutation-state': 'warn',

      // RATIONALE:         Catches some common coding mistakes.
      'react/no-unescaped-entities': 'warn',

      // RATIONALE:         Avoids a potential performance problem.
      'react/no-find-dom-node': 'warn',

      // RATIONALE:         Deprecated API.
      'react/no-is-mounted': 'warn',

      // RATIONALE:         Deprecated API.
      'react/no-render-return-value': 'warn',

      // RATIONALE:         Deprecated API.
      'react/no-string-refs': 'warn',

      // RATIONALE:         Improves syntax for some cases that are not already handled by Prettier.
      'react/self-closing-comp': 'warn'
    }
  }
];
