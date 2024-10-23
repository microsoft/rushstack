'use strict';

const webpack = require('webpack');
const { PreserveDynamicRequireWebpackPlugin } = require('@rushstack/webpack-preserve-dynamic-require-plugin');
const PathConstants = require('./lib/PathConstants');

module.exports = () => {
  return {
    context: __dirname,
    mode: 'development', // So the output isn't minified
    devtool: 'source-map',
    entry: {
      [PathConstants.createLinksScriptFilename]: {
        import: `${__dirname}/lib-esnext/scripts/createLinks/start.js`,
        filename: `[name]`
      }
    },
    output: {
      path: PathConstants.scriptsFolderPath,
      filename: '[name].js',
      chunkFilename: 'chunks/[name].js', // TODO: Don't allow any chunks to be created
      library: {
        type: 'commonjs2'
      }
    },
    target: 'node',
    plugins: [
      new PreserveDynamicRequireWebpackPlugin(),
      new webpack.ids.DeterministicModuleIdsPlugin({
        maxLength: 6
      })
    ],
    resolve: {
      alias: {
        // This is included by the 'mz' package which is a dependency of '@pnpm/link-bins' but is unused
        'graceful-fs': false
      }
    }
  };
};
