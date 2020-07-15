'use strict';

const path = require('path');

module.exports = {
  resolve: {
    extensions: ['.js', '.jsx', '.json']
  },
  entry: {
    'localization-test-A': path.join(__dirname, 'lib', 'indexA.js'),
    'localization-test-B': path.join(__dirname, 'lib', 'indexB.js')
  },
  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[name]_[locale]_[contenthash].js',
    chunkFilename: '[id].[name]_[locale]_[contenthash].js'
  }
};
