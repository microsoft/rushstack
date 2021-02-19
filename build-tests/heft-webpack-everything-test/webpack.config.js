'use strict';

const path = require('path');

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
      }
    ]
  },
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
    chunkFilename: '[id].[name]_[contenthash].js'
  }
};
