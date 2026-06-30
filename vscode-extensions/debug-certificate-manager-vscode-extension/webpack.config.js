// @ts-check
/* eslint-env es6 */

'use strict';

const { createExtensionConfig } = require('local-vscode-extension-rig/profiles/default/webpack.config.base');

function createConfig({ production, webpack }) {
  const config = createExtensionConfig({
    production: false,
    webpack,
    entry: {
      extension: './lib-esm/extension.js'
    },
    outputPath: `${__dirname}/dist/vsix/unpacked`
  });
  return config;
}

module.exports = createConfig;
