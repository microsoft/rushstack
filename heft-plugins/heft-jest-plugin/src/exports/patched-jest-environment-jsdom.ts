// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const PUNYCODE_MODULE_NAME: 'punycode' = 'punycode';
const nodeMajorVersion: number = parseInt(process.versions.node, 10);
if (nodeMajorVersion >= 22) {
  // Inject the "punycode" module into the Node.js module cache in Node >=22. JSDom has indirect
  // dependencies on this module, which is marked as deprecated in Node >=22.
  const punycode: unknown = require('punycode/punycode');
  require.cache[PUNYCODE_MODULE_NAME] = {
    id: PUNYCODE_MODULE_NAME,
    path: PUNYCODE_MODULE_NAME,
    exports: punycode,
    isPreloading: false,
    require,
    filename: PUNYCODE_MODULE_NAME,
    loaded: true,
    parent: undefined,
    children: [],
    paths: []
  };
}

module.exports = require('jest-environment-jsdom');
