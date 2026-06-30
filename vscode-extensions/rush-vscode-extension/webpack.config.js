// @ts-check
/* eslint-env es6 */

'use strict';

const { createExtensionConfig } = require('local-vscode-extension-rig/profiles/default/webpack.config.base');

function createConfig({ production, webpack }) {
  const config = createExtensionConfig({
    production,
    webpack,
    entry: {
      extension: './lib-esm/extension.js'
    },
    outputPath: `${__dirname}/dist/vsix/unpacked`
  });

  if (!config.externals) {
    config.externals = {};
  }
  config.externals['@microsoft/rush-lib'] = 'commonjs @microsoft/rush-lib';

  return config;
}

module.exports = createConfig;
