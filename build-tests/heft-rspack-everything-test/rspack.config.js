'use strict';

const path = require('path');
const { HtmlRspackPlugin, SwcJsMinimizerRspackPlugin } = require('@rspack/core');

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
  target: ['web', 'es2020'],
  resolve: {
    extensions: ['.js', '.jsx', '.json']
  },
  entry: {
    'heft-test-A': path.join(__dirname, 'lib', 'indexA.js'),
    'heft-test-B': path.join(__dirname, 'lib', 'indexB.js')
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
    minimizer: [new SwcJsMinimizerRspackPlugin({})]
  },
  plugins: [new HtmlRspackPlugin()]
};
