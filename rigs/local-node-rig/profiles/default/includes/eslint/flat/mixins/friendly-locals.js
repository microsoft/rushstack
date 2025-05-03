// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { defineConfig } = require('eslint/config');
const friendlyLocalsMixin = require('local-eslint-config/mixins/friendly-locals');

module.exports = defineConfig([...friendlyLocalsMixin]);
