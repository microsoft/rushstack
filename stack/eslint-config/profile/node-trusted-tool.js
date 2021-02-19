// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This profile enables lint rules intended for a Node.js project whose inputs will always
// come from a developer or other trusted source.  Most build system tasks are like this,
// since they operate on exclusively files prepared by a developer.
//
// This profile disables certain security rules that would otherwise prohibit APIs that could
// cause a denial-of-service by consuming too many resources, or which might interact with
// the filesystem in unsafe ways.  Such activities are safe and commonplace for a trusted tool.
//
// DO NOT use this profile for a library project that might also be loaded by a Node.js service;
// use "@rushstack/eslint-config/profiles/node" instead.

const { buildRules } = require('./_common');

const rules = buildRules('node-trusted-tool');
module.exports = rules;
