/* eslint-env es6 */
'use strict';

const webpack = require('webpack');
const { PackageJsonLookup } = require('@rushstack/node-core-library');
const { PreserveDynamicRequireWebpackPlugin } = require('@rushstack/webpack-preserve-dynamic-require-plugin');
const { DeepImportsPlugin } = require('@rushstack/webpack-deep-imports-plugin');

module.exports = () => {
  const packageJson = PackageJsonLookup.loadOwnPackageJson(__dirname);

  const externalDependencyNames = new Set([
    ...Object.keys(packageJson.dependencies || {})
    // ...Object.keys(packageJson.peerDependencies || {}),
    // ...Object.keys(packageJson.optionalDependencies || {}),
    // ...Object.keys(packageJson.devDependencies || {})
  ]);

  return {
    context: __dirname,
    mode: 'development', // So the output isn't minified
    devtool: 'source-map',
    entry: {
      'rush-sdk': `${__dirname}/lib-esnext/index.js`
    },
    output: {
      path: `${__dirname}/dist`,
      filename: '[name].js',
      chunkFilename: 'chunks/[name].js',
      library: {
        type: 'commonjs2'
      }
    },
    target: 'node',
    plugins: [
      new PreserveDynamicRequireWebpackPlugin(),
      new webpack.ids.DeterministicModuleIdsPlugin({
        maxLength: 6
      }),
      new DeepImportsPlugin({
        path: `${__dirname}/temp/rush-sdk-manifest.json`,
        inFolderName: 'lib-esnext',
        outFolderName: 'lib',
        pathsToIgnore: [],
        dTsFilesInputFolderName: 'lib-commonjs'
      })
    ],
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
