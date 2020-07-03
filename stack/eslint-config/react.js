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
        'react/jsx-key': 'error',

        // RATIONALE:         Catches a common coding practice that significantly impacts performance.
        'react/jsx-no-bind': 'error',

        // RATIONALE:         Catches a common coding mistake.
        'react/jsx-no-comment-textnodes': 'error',

        // RATIONALE:         Security risk.
        'react/jsx-no-target-blank': 'error',

        // RATIONALE:         Fixes the no-unused-vars rule to make it compatible with React
        'react/jsx-uses-react': 'error',

        // RATIONALE:         Fixes the no-unused-vars rule to make it compatible with React
        'react/jsx-uses-vars': 'error',

        // RATIONALE:         Catches a common coding mistake.
        'react/no-children-prop': 'error',

        // RATIONALE:         Catches a common coding mistake.
        'react/no-danger-with-children': 'error',

        // RATIONALE:         Avoids usage of deprecated APIs.
        //
        // Note that the set of deprecated APIs is determined by the "react.version" setting.
        'react/no-deprecated': 'error',

        // RATIONALE:         Catches a common coding mistake.
        'react/no-direct-mutation-state': 'error',

        // RATIONALE:         Catches some common coding mistakes.
        'react/no-unescaped-entities': 'error',

        // RATIONALE:         Avoids a potential performance problem.
        'react/no-find-dom-node': 'error',

        // RATIONALE:         Deprecated API.
        'react/no-is-mounted': 'error',

        // RATIONALE:         Deprecated API.
        'react/no-render-return-value': 'error',

        // RATIONALE:         Deprecated API.
        'react/no-string-refs': 'error',

        // RATIONALE:         Improves syntax for some cases that are not already handled by Prettier.
        'react/self-closing-comp': 'error'
      }
    }
  ]
};
