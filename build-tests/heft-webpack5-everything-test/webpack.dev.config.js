'use strict';

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'none',
  module: {
    rules: [
      {
        test: /\.png$/i,
        type: 'asset/resource'
      }
    ]
  },
  target: ['web', 'es2020'],
  resolve: {
    extensions: ['.js', '.json']
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
    minimize: false,
    minimizer: []
  },
  plugins: [new HtmlWebpackPlugin()]
};
