'use strict';

const path = require('path');

module.exports = {
  mode: 'development',
  resolve: {
    extensions: ['.js', '.jsx', '.json']
  },
  entry: {
    'heft-test': path.join(__dirname, 'lib', 'index.js')
  },
  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[name]_[contenthash].js'
  }
};
