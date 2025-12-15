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
    outputPath: path.resolve(__dirname, 'dist', 'vsix', 'unpacked')
  });

  if (config.resolve === undefined) {
    config.resolve = {};
  }

  if (config.resolve.fallback === undefined) {
    config.resolve.fallback = {};
  }

  // `ws` module depends on `bufferutil` and `utf-8-validate`
  Object.assign(config.resolve.fallback, {
    bufferutil: require.resolve('bufferutil/'),
    'utf-8-validate': require.resolve('utf-8-validate/')
  });

  return config;
}

module.exports = createConfig;
