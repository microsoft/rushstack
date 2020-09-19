// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This profile enables lint rules intended for a web application.  It enables security rules
// that are relevant to web browser APIs such as DOM.

const common = require('./_common');

module.exports = {
  ...common,

  '@rushstack/security/no-unsafe-regexp': 'warn'
};
