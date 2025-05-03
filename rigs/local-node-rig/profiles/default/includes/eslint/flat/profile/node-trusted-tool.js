// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { defineConfig } = require('eslint/config');
const nodeTrustedToolProfile = require('local-eslint-config/flat/profile/node-trusted-tool');

module.exports = defineConfig([...nodeTrustedToolProfile]);
