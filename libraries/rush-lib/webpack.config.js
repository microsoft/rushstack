'use strict';

const webpack = require('webpack');
const { PackageJsonLookup, FileSystem, Path } = require('@rushstack/node-core-library');
const { PreserveDynamicRequireWebpackPlugin } = require('@rushstack/webpack-preserve-dynamic-require-plugin');
const { DeepImportsCompatPlugin } = require('@rushstack/webpack-deep-imports-compat-plugin');
const PathConstants = require('./lib-commonjs/utilities/PathConstants');

const SCRIPT_ENTRY_OPTIONS = {
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

  const configuration = {
    context: __dirname,
    mode: 'development', // So the output isn't minified
    devtool: 'source-map',
    entry: {
      [PathConstants.pnpmfileShimFilename]: {
        import: `${__dirname}/lib-esnext/logic/pnpm/PnpmfileShim.js`,
        ...SCRIPT_ENTRY_OPTIONS
      },
      [PathConstants.installRunScriptFilename]: {
        import: `${__dirname}/lib-esnext/scripts/install-run.js`,
        ...SCRIPT_ENTRY_OPTIONS
      },
      [PathConstants.installRunRushScriptFilename]: {
        import: `${__dirname}/lib-esnext/scripts/install-run-rush.js`,
        ...SCRIPT_ENTRY_OPTIONS
      },
      [PathConstants.installRunRushxScriptFilename]: {
        import: `${__dirname}/lib-esnext/scripts/install-run-rushx.js`,
        ...SCRIPT_ENTRY_OPTIONS
      }
    },
    output: {
      path: `${__dirname}/dist`,
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

  DeepImportsCompatPlugin.applyToWebpackConfiguration(configuration, {
    bundleName: 'rush-lib',
    inFolder: {
      folderName: 'lib-esnext',
      includePatterns: ['**/*.js'],
      excludePatterns: [
        '**/*.test.*',
        '**/test/**/*',
        '**/__mocks__/**/*',
        'utilities/prompts/SearchListPrompt.js' // This module has an import with typings issues
      ]
    },
    outFolderName: 'lib'
  });

  return configuration;
};
