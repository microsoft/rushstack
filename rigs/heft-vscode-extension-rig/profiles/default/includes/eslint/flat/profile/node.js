// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const nodeProfile = require('@rushstack/heft-node-rig/profiles/default/includes/eslint/flat/profile/node');

module.exports = [
  ...nodeProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Rationale: Use of `void` to explicitly indicate that a floating promise is expected
      // and allowed.
      'no-void': ['error', { allowAsStatement: true }]
    }
  }
];
