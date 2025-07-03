// @ts-check
/* eslint-env es6 */

'use strict';

const {
  createExtensionConfig
} = require('@rushstack/heft-vscode-extension-rig/profiles/default/webpack.config.base');
const path = require('node:path');

function createConfig({ production, webpack }) {
  const config = createExtensionConfig({
    production,
    webpack,
    entry: {
      extension: './lib/extension.js'
    },
    outputPath: path.resolve(__dirname, 'dist', 'vsix', 'unpacked')
  });

  if (!config.externals) {
    config.externals = {};
  }
  config.externals['@microsoft/rush-lib'] = 'commonjs @microsoft/rush-lib';

  return config;
}

module.exports = createConfig;
