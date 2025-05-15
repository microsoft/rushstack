// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This profile enables lint rules intended for a general Node.js project, typically a web service.
// It enables security rules that assume the service could receive malicious inputs from an
// untrusted user.  If that is not the case, consider using the "node-trusted-tool" profile instead.

const nodeProfile = require('@rushstack/eslint-config/flat/profile/node');

const { localCommonConfig } = require('./_common');

module.exports = [...nodeProfile, ...localCommonConfig];
