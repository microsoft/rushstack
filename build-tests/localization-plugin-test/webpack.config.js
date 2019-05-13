'use strict';

const path = require('path');
const webpack = require('webpack');

const { LocalizationPlugin } = require('@microsoft/localization-plugin');

module.exports = function(env) {
  const configuration = {
    mode: 'production',
    resolve: {
      extensions: ['.js', '.jsx', '.json'],
    },
    entry: {
      'localization-test': path.join(__dirname, 'lib', 'index.js')
    },
    output: {
      path: path.join(__dirname, 'dist'),
      filename: '[name]_[locale]_[contenthash].js',
      chunkFilename: '[id].[name]_[locale]_[contenthash].js'
    },
    optimization: {
      minimize: false
    },
    plugins: [
      new webpack.optimize.ModuleConcatenationPlugin(),
      new LocalizationPlugin({

      })
    ]
  };

  return configuration;
}
