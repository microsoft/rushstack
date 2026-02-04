/* eslint-env es6 */
'use strict';

const { PackageJsonLookup } = require('@rushstack/node-core-library');
const { PreserveDynamicRequireWebpackPlugin } = require('@rushstack/webpack-preserve-dynamic-require-plugin');
const { BannerPlugin } = require('webpack');

module.exports = () => {
  const packageJson = PackageJsonLookup.loadOwnPackageJson(__dirname);

  const externalDependencyNames = new Set(Object.keys(packageJson.dependencies || {}));

  // Get all export specifiers by require rush-lib
  const rushLib = require('@microsoft/rush-lib');
  const exportSpecifiers = Object.keys(rushLib);
  const bannerCodeForLibShim = exportSpecifiers.length
    ? exportSpecifiers.map((name) => `exports.${name}`).join(' = ') + ' = undefined;\n\n'
    : '';

  // Explicitly exclude @microsoft/rush-lib
  externalDependencyNames.delete('@microsoft/rush-lib');

  return {
    context: __dirname,
    mode: 'development', // So the output isn't minified
    devtool: 'source-map',
    entry: {
      // Using CommonJS due to access of module.parent
      index: `${__dirname}/lib-commonjs/index.js`,
      loader: `${__dirname}/lib-commonjs/loader.js`
    },
    output: {
      path: `${__dirname}/lib-shim`,
      filename: '[name].js',
      chunkFilename: 'chunks/[name].js',
      library: {
        type: 'commonjs2'
      }
    },
    optimization: {
      flagIncludedChunks: true,
      concatenateModules: true,
      providedExports: true,
      usedExports: true,
      sideEffects: true,
      removeAvailableModules: true,
      minimize: false,
      realContentHash: true,
      innerGraph: true
    },
    target: 'node',
    plugins: [
      new BannerPlugin({ raw: true, banner: bannerCodeForLibShim }),
      new PreserveDynamicRequireWebpackPlugin()
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
    ]
  };
};
