'use strict';

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const createWebpackConfigCommon = require('../../shared/webpack-base.config');

module.exports = function createWebpackConfig({ env, argv, projectRoot, configOverride }) {
  // Documentation: https://webpack.js.org/configuration/
  const applicationOverrides = {
    target: ['web', 'es5'],
    entry: {
      app: path.resolve(projectRoot, 'lib', 'start.js')
    },
    optimization: {
      splitChunks: {
        chunks: 'all'
      }
    },
    plugins: [
      // NOTE: If your project's webpack.config.js provides its own "HtmlWebpackPlugin" configuration,
      // it will replace the default definition here.  This replacement is implemented
      // using mergeWithCustomize() in shared/webpack-base.config.js

      // See here for documentation: https://github.com/jantimon/html-webpack-plugin
      new HtmlWebpackPlugin({
        filename: 'index.html',
        template: path.resolve(projectRoot, 'assets', 'index.html')
      })
    ]
  };

  return createWebpackConfigCommon({
    env: env,
    argv: argv,
    projectRoot: projectRoot,
    extractCssInProduction: true,
    configOverride: createWebpackConfigCommon.merge(applicationOverrides, configOverride)
  });
};
