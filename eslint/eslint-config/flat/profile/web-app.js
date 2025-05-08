// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This profile enables lint rules intended for a web application.  It enables security rules
// that are relevant to web browser APIs such as DOM.
//
// Also use this profile if you are creating a library that can be consumed by both Node.js
// and web applications.

const { commonConfig } = require('./_common');

module.exports = [...commonConfig];
