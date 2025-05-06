// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { defineConfig } = require('eslint/config');
const packletsMixin = require('@rushstack/eslint-config/flat/mixins/packlets');

module.exports = defineConfig([...packletsMixin]);
