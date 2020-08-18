// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

module.exports = {
  plugins: ['eslint-plugin-react'],

  settings: {
    react: {
      version: 'detect'
    }
  },

  overrides: [
    {
      // Declare an override that applies to TypeScript files only
      files: ['*.ts', '*.tsx'],

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
  ]
};
