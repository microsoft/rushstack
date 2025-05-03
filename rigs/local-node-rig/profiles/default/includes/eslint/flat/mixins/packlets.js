// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { defineConfig } = require('eslint/config');
const packletsMixin = require('local-eslint-config/mixins/packlets');

module.exports = defineConfig([...packletsMixin]);
