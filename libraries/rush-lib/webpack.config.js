'use strict';

const webpack = require('webpack');
const { PackageJsonLookup } = require('@rushstack/node-core-library');
const { PreserveDynamicRequireWebpackPlugin } = require('@rushstack/webpack-preserve-dynamic-require-plugin');
const PathConstants = require('./lib-commonjs/utilities/PathConstants');

const scriptEntryOption = {
  filename: `${PathConstants.scriptsFolderName}/[name]`,
  library: {
    type: 'commonjs2'
  }
};

module.exports = () => {
  const packageJson = PackageJsonLookup.loadOwnPackageJson(__dirname);

  const externalDependencyNames = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
    ...Object.keys(packageJson.optionalDependencies || {}),
    ...Object.keys(packageJson.devDependencies || {})
  ]);

  return {
    mode: 'development', // So the output isn't minified
    devtool: 'source-map',
    entry: {
      ['index']: {
        import: `${__dirname}/lib-esnext/index.js`,
        library: {
          type: 'commonjs'
        }
      },
      [PathConstants.pnpmfileShimFilename]: {
        import: `${__dirname}/lib-esnext/logic/pnpm/PnpmfileShim.js`,
        ...scriptEntryOption
      },
      [PathConstants.installRunScriptFilename]: {
        import: `${__dirname}/lib-esnext/scripts/install-run.js`,
        ...scriptEntryOption
      },
      [PathConstants.installRunRushScriptFilename]: {
        import: `${__dirname}/lib-esnext/scripts/install-run-rush.js`,
        ...scriptEntryOption
      },
      [PathConstants.installRunRushxScriptFilename]: {
        import: `${__dirname}/lib-esnext/scripts/install-run-rushx.js`,
        ...scriptEntryOption
      }
    },
    output: {
      path: `${__dirname}/lib`,
      filename: '[name].js',
      chunkFilename: 'chunks/[name].js'
    },
    target: 'node',
    plugins: [
      new PreserveDynamicRequireWebpackPlugin(),
      new webpack.ids.DeterministicModuleIdsPlugin({
        maxLength: 6
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
    ]
  };
};
