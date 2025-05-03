// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const { defineConfig } = require('eslint/config');
const reactMixin = require('local-eslint-config/mixins/react');

module.exports = defineConfig([...reactMixin]);
