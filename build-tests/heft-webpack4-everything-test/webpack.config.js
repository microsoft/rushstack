'use strict';

const path = require('path');
const { ModuleMinifierPlugin } = require('@rushstack/webpack4-module-minifier-plugin');
const { WorkerPoolMinifier } = require('@rushstack/module-minifier');

module.exports = {
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.png$/i,
        use: [
          {
            loader: 'file-loader'
          }
        ]
      },
      {
        test: /\.js$/,
        enforce: 'pre',
        use: ['source-map-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.json']
  },
  entry: {
    'heft-test-A': path.join(__dirname, 'lib-esm', 'indexA.js'),
    'heft-test-B': path.join(__dirname, 'lib-esm', 'indexB.js')
  },
  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[name]_[contenthash].js',
    chunkFilename: '[id].[name]_[contenthash].js'
  },
  devtool: 'source-map',
  optimization: {
    minimize: true,
    minimizer: [
      new ModuleMinifierPlugin({
        minifier: new WorkerPoolMinifier({
          terserOptions: {
            ecma: 2020,
            mangle: true
          },
          verbose: true
        }),
        sourceMap: true
      })
    ]
  }
};
