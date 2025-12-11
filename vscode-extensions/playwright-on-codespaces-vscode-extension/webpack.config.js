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

  // Add fallbacks for Node.js modules not available in the VS Code extension host
  Object.assign(config.resolve.fallback, {
    bufferutil: false,
    'utf-8-validate': false
  });

  return config;
}

module.exports = createConfig;
