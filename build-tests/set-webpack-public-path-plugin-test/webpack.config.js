'use strict';

const { SetPublicPathPlugin } = require('@rushstack/set-webpack-public-path-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleMinifierPlugin } = require('@rushstack/webpack5-module-minifier-plugin');
const { WorkerPoolMinifier } = require('@rushstack/module-minifier');

function generateConfiguration(mode, outputFolderName) {
  return {
    mode: mode,
    target: ['web', 'es5'],
    entry: {
      'test-bundle': `${__dirname}/lib/index.js`
    },
    output: {
      path: `${__dirname}/${outputFolderName}`,
      filename: '[name]_[contenthash].js',
      chunkFilename: '[id].[name]_[contenthash].js'
    },
    plugins: [
      new SetPublicPathPlugin({
        scriptName: {
          useAssetName: true
        }
      }),
      new HtmlWebpackPlugin()
    ],
    optimization: {
      minimizer: [
        new ModuleMinifierPlugin({
          minifier: new WorkerPoolMinifier({
            terserOptions: {
              ecma: 5
            }
          }),
          useSourceMap: true
        })
      ]
    }
  };
}

module.exports = [
  generateConfiguration('development', 'dist-dev'),
  generateConfiguration('production', 'dist-prod')
];
