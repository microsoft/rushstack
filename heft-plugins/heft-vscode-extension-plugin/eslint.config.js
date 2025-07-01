// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const nodeTrustedToolProfile = require('@rushstack/heft-node-rig/profiles/default/includes/eslint/flat/profile/node-trusted-tool');
const friendlyLocalsMixin = require('@rushstack/heft-node-rig/profiles/default/includes/eslint/flat/mixins/friendly-locals');

module.exports = [...nodeTrustedToolProfile, ...friendlyLocalsMixin];
