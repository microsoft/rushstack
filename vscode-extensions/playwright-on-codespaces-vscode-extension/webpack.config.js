// @ts-check
/* eslint-env es6 */

'use strict';

const {
  createExtensionConfig
} = require('@rushstack/heft-vscode-extension-rig/profiles/default/webpack.config.base');
const path = require('node:path');

function createConfig({ production, webpack }) {
  const config = createExtensionConfig({
    production: false,
    webpack,
    entry: {
      extension: './lib/extension.js'
    },
    outputPath: `${__dirname}/dist/vsix/unpacked`
  });

  return config;
}

module.exports = createConfig;
