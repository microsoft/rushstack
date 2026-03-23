'use strict';

const path = require('path');
const webpack = require('webpack');

const { HashedFolderCopyPlugin } = require('@rushstack/hashed-folder-copy-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const HtmlWebpackPlugin = require('html-webpack-plugin');

function generateConfiguration(mode, outputFolderName) {
  return {
    mode: mode,
    entry: {
      test: path.join(__dirname, 'lib-esm', 'index.js')
    },
    output: {
      path: path.join(__dirname, outputFolderName),
      filename: '[name]_[contenthash].js',
      chunkFilename: '[id].[name]_[contenthash].js'
    },
    plugins: [
      new webpack.optimize.ModuleConcatenationPlugin(),
      new HashedFolderCopyPlugin(),
      new BundleAnalyzerPlugin({
        openAnalyzer: false,
        analyzerMode: 'static',
        reportFilename: path.resolve(__dirname, 'temp', 'stats.html'),
        generateStatsFile: true,
        statsFilename: path.resolve(__dirname, 'temp', 'stats.json'),
        logLevel: 'error'
      }),
      new HtmlWebpackPlugin()
    ]
  };
}

module.exports = [
  generateConfiguration('development', 'dist-dev'),
  generateConfiguration('production', 'dist-prod')
];
