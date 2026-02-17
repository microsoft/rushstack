'use strict';

const webpack = require('webpack');
const { PreserveDynamicRequireWebpackPlugin } = require('@rushstack/webpack-preserve-dynamic-require-plugin');
const { CREATE_LINKS_SCRIPT_FILENAME, SCRIPTS_FOLDER_PATH } = require('./lib-commonjs/PathConstants');

module.exports = () => {
  return {
    context: __dirname,
    mode: 'development', // So the output isn't minified
    devtool: 'source-map',
    entry: {
      [CREATE_LINKS_SCRIPT_FILENAME]: {
        import: `${__dirname}/lib-esnext/scripts/createLinks/start.js`,
        filename: `[name]`
      }
    },
    output: {
      path: SCRIPTS_FOLDER_PATH,
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
    ignoreWarnings: [
      // This is included by the 'mz' package which is a dependency of '@pnpm/link-bins' but is unused
      /Module not found: Error: Can't resolve 'graceful-fs'/
    ]
  };
};
