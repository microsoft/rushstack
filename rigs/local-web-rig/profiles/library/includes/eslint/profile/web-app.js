// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { defineConfig } = require('eslint/config');
const webAppConfig = require('local-eslint-config/profile/web-app');

module.exports = defineConfig([...webAppConfig]);
