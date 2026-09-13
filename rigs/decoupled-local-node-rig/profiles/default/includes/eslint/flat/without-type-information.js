// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const {
  withoutTypeInformation: baseWithoutTypeInformation
} = require('@rushstack/eslint-config/flat/without-type-information');

const { localTypeAwareRules } = require('./profile/_common');

// Like @rushstack/eslint-config's withoutTypeInformation(), but also disables the type-aware rules that this
// rig layers on top of the profile (localCommonConfig). Use this for TypeScript files that are selected by your
// ESLint configuration but are not part of the project's TypeScript program (for example config files or tests
// that are not included by tsconfig.json).
//
// IMPORTANT: These config objects must be included in your ESLint configuration AFTER the profile.
function withoutTypeInformation({ files }) {
  return baseWithoutTypeInformation({
    files,
    additionalTypeAwareRuleNames: Object.keys(localTypeAwareRules)
  });
}

module.exports = { withoutTypeInformation };
