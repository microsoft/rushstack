/* eslint-env es6 */
'use strict';

const webpack = require('webpack');
const { PackageJsonLookup } = require('@rushstack/node-core-library');
const { PreserveDynamicRequireWebpackPlugin } = require('@rushstack/webpack-preserve-dynamic-require-plugin');

module.exports = () => {
  const packageJson = PackageJsonLookup.loadOwnPackageJson(__dirname);

  const externalDependencyNames = new Set([...Object.keys(packageJson.dependencies || {})]);

  // Explicitly exclude @microsoft/rush-lib
  externalDependencyNames.delete('@microsoft/rush-lib');

  return {
    context: __dirname,
    mode: 'development', // So the output isn't minified
    devtool: 'source-map',
    entry: {
      index: `${__dirname}/lib-esnext/index.js`,
      loader: `${__dirname}/lib-esnext/loader.js`
    },
    output: {
      path: `${__dirname}/lib-shim`,
      filename: '[name].js',
      chunkFilename: 'chunks/[name].js',
      library: {
        type: 'commonjs2'
      }
    },
    target: 'node',
    plugins: [new PreserveDynamicRequireWebpackPlugin()],
    externals: [
      ({ request }, callback) => {
        let packageName;
        let firstSlashIndex = request.indexOf('/');
        if (firstSlashIndex === -1) {
          packageName = request;
        } else if (request.startsWith('@')) {
          let secondSlash = request.indexOf('/', firstSlashIndex + 1);
          if (secondSlash === -1) {
            packageName = request;
          } else {
            packageName = request.substring(0, secondSlash);
          }
        } else {
          packageName = request.substring(0, firstSlashIndex);
        }

        if (externalDependencyNames.has(packageName)) {
          callback(null, `commonjs ${request}`);
        } else {
          callback();
        }
      }
    ],
    optimization: {
      splitChunks: {
        chunks: 'all',
        minChunks: 1,
        cacheGroups: {
          commons: {
            name: 'commons',
            chunks: 'initial'
          }
        }
      }
    }
  };
};
