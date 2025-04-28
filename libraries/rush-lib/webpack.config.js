'use strict';

const webpack = require('webpack');
const { PackageJsonLookup } = require('@rushstack/node-core-library');
const { PreserveDynamicRequireWebpackPlugin } = require('@rushstack/webpack-preserve-dynamic-require-plugin');
const { DeepImportsPlugin } = require('@rushstack/webpack-deep-imports-plugin');
const PathConstants = require('./lib-commonjs/utilities/PathConstants');

const SCRIPT_ENTRY_OPTIONS = {
  filename: `${PathConstants.scriptsFolderName}/[name]`
};

module.exports = () => {
  const packageJson = PackageJsonLookup.loadOwnPackageJson(__dirname);

  const externalDependencyNames = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
    ...Object.keys(packageJson.optionalDependencies || {}),
    ...Object.keys(packageJson.devDependencies || {})
  ]);

  function generateConfiguration(entry, extraPlugins = [], splitChunks = undefined) {
    return {
      context: __dirname,
      mode: 'development', // So the output isn't minified
      devtool: 'source-map',
      entry,
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
        ...extraPlugins
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
        splitChunks
      }
    };
  }

  const configurations = [
    generateConfiguration(
      {
        'rush-lib': `${__dirname}/lib-esnext/index.js`,
        start: `${__dirname}/lib-esnext/start.js`,
        startx: `${__dirname}/lib-esnext/startx.js`,
        'start-pnpm': `${__dirname}/lib-esnext/start-pnpm.js`
      },
      [
        new DeepImportsPlugin({
          // A manifest will be produced for each entry point, so since this compilation has multiple entry points,
          // it needs to specify a template for the manifest filename.
          // Otherwise webpack will throw an error about multiple writes to the same manifest file.
          path: `${__dirname}/temp/build/webpack-dll/[name].json`,
          inFolderName: 'lib-esnext',
          outFolderName: 'lib',
          pathsToIgnore: ['utilities/prompts/SearchListPrompt.js'],
          dTsFilesInputFolderName: 'lib-commonjs'
        })
      ],
      {
        chunks: 'all',
        minChunks: 1,
        cacheGroups: {
          commons: {
            name: 'commons',
            chunks: 'initial',
            minChunks: 2
          }
        }
      }
    ),
    generateConfiguration({
      [PathConstants.pnpmfileShimFilename]: {
        import: `${__dirname}/lib-esnext/logic/pnpm/PnpmfileShim.js`,
        ...SCRIPT_ENTRY_OPTIONS
      },
      [PathConstants.subspacePnpmfileShimFilename]: {
        import: `${__dirname}/lib-esnext/logic/pnpm/SubspaceGlobalPnpmfileShim.js`,
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
      },
      [PathConstants.installRunRushPnpmScriptFilename]: {
        import: `${__dirname}/lib-esnext/scripts/install-run-rush-pnpm.js`,
        ...SCRIPT_ENTRY_OPTIONS
      }
    })
  ];

  return configurations;
};
