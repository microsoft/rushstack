// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This file is copied into the dist folder when the web app is being loaded
// from Webpack dev server.  In a production release, a generated script is served by the
// Node.js service with the live context object.

console.log('Loaded stub/initappcontext.js');

window.appContext = {
  serviceUrl: 'http://localhost:8091',
  appVersion: '(dev)',
  debugMode: true
};
