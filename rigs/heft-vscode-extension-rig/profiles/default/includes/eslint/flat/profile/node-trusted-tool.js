// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const nodeTrustedToolProfile = require('@rushstack/heft-node-rig/profiles/default/includes/eslint/flat/profile/node-trusted-tool');

module.exports = [
  ...nodeTrustedToolProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Rationale: Use of `void` to explicitly indicate that a floating promise is expected
      // and allowed.
      'no-void': ['error', { allowAsStatement: true }],

      // Rationale: Use of `console` logging is generally discouraged. Use VS Code output
      // channels where possible to surface logs.
      'no-console': ['warn', { allow: ['debug', 'info', 'time', 'timeEnd', 'trace'] }]
    }
  }
];
