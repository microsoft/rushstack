'use strict';

const path = require('path');
const { ModuleMinifierPlugin } = require('@rushstack/webpack5-module-minifier-plugin');
const { WorkerPoolMinifier } = require('@rushstack/module-minifier');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.png$/i,
        type: 'asset/resource'
      },
      {
        test: /\.js$/,
        enforce: 'pre',
        use: ['source-map-loader']
      }
    ]
  },
  target: ['web', 'es5'],
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
    chunkFilename: '[id].[name]_[contenthash].js',
    assetModuleFilename: '[name]_[contenthash][ext][query]'
  },
  devtool: 'source-map',
  optimization: {
    minimize: true,
    minimizer: [
      new ModuleMinifierPlugin({
        minifier: new WorkerPoolMinifier({
          terserOptions: {
            ecma: 5,
            mangle: true
          },
          verbose: true
        }),
        sourceMap: true
      })
    ]
  },
  plugins: [new HtmlWebpackPlugin()]
};
