// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

module.exports = {
  extends: ['@rushstack/heft-node-rig/profiles/default/includes/eslint/profile/node'],

  rules: {
    // Rationale: Use of `void` to explicitly indicate that a floating promise is expected
    // and allowed.
    'no-void': ['error', { allowAsStatement: true }]
  }
};
