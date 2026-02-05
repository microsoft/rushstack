// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// IMPORTANT: Mixins must be included in your ESLint configuration AFTER the profile

const sortPackageJsonMixin = require('@rushstack/eslint-config/flat/mixins/sort-package-json');

module.exports = [...sortPackageJsonMixin];
