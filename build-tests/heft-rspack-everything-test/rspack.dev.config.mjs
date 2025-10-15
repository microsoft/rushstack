// @ts-check
/** @typedef {import('@rushstack/heft-rspack-plugin').IRspackConfiguration} IRspackConfiguration */
'use strict';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HtmlRspackPlugin } from '@rspack/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {IRspackConfiguration} */
const config = {
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
    extensions: ['.js', '.jsx', '.json']
  },
  entry: {
    'heft-test-A': resolve(__dirname, 'lib', 'indexA.js'),
    'heft-test-B': resolve(__dirname, 'lib', 'indexB.js')
  },
  output: {
    path: resolve(__dirname, 'dist'),
    filename: '[name]_[contenthash].js',
    chunkFilename: '[id].[name]_[contenthash].js',
    assetModuleFilename: '[name]_[contenthash][ext][query]'
  },
  devtool: 'source-map',
  optimization: {
    minimize: false,
    minimizer: []
  },
  plugins: [new HtmlRspackPlugin()]
};

export default config;
