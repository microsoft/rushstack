// @ts-check
/* eslint-env es6 */

'use strict';

const { PreserveDynamicRequireWebpackPlugin } = require('@rushstack/webpack-preserve-dynamic-require-plugin');

/** @typedef {import('webpack').Configuration} WebpackConfig **/
function createExtensionConfig({ production, webpack, entry, outputPath }) {
  /** @type WebpackConfig */
  const extensionConfig = {
    target: 'node',
    mode: production ? 'production' : 'none',
    entry,
    output: {
      path: outputPath,
      filename: 'extension.js',
      libraryTarget: 'commonjs2'
    },
    externals: {
      vscode: 'commonjs vscode'
    },
    devtool: production ? 'hidden-source-map' : 'source-map',
    infrastructureLogging: {
      level: 'log'
    },
    plugins: [
      new PreserveDynamicRequireWebpackPlugin(),
      new webpack.DefinePlugin({
        ___DEV___: JSON.stringify(!production)
      })
    ],
    optimization: {
      minimize: false
    }
  };
  return extensionConfig;
}

function createWebExtensionConfig({ production, webpack, entry, outputPath }) {
  /** @type WebpackConfig */
  const webExtensionConfig = {
    target: 'webworker', // extensions run in a webworker context
    mode: production ? 'production' : 'none',
    entry,
    output: {
      filename: 'extension.js',
      path: outputPath,
      libraryTarget: 'commonjs'
    },
    plugins: [
      new webpack.optimize.LimitChunkCountPlugin({
        maxChunks: 1 // disable chunks by default since web extensions must be a single bundle
      }),
      new webpack.ProvidePlugin({
        process: 'process/browser' // provide a shim for the global `process` variable
      }),
      new webpack.DefinePlugin({
        ___DEV___: JSON.stringify(!production)
      })
    ],
    externals: {
      vscode: 'commonjs vscode'
    },
    devtool: production ? 'hidden-source-map' : 'source-map',
    infrastructureLogging: {
      level: 'log'
    },
    optimization: {
      minimize: false
    }
  };

  return webExtensionConfig;
}

module.exports = { createExtensionConfig, createWebExtensionConfig };
