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

  // Mark problematic modules as externals to avoid webpack bundling issues
  const externals = /** @type {Record<string, string>} */ (config.externals || {});
  externals['playwright-core'] = 'commonjs playwright-core';
  externals['bufferutil'] = 'commonjs bufferutil';
  externals['utf-8-validate'] = 'commonjs utf-8-validate';
  config.externals = externals;

  return config;
}

module.exports = createConfig;
