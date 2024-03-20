// @ts-check
/* eslint-env es6 */

'use strict';

const path = require('path');
// eslint-disable-next-line @typescript-eslint/naming-convention
const { PreserveDynamicRequireWebpackPlugin } = require('@rushstack/webpack-preserve-dynamic-require-plugin');

// @ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

function createExtensionConfig({ production, webpack }) {
  /** @type WebpackConfig */
  const extensionConfig = {
    target: 'node', // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
    mode: production ? 'production' : 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

    entry: './lib/extension.js', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    output: {
      // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2'
    },
    externals: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      '@microsoft/rush-lib': 'commonjs @microsoft/rush-lib',
      vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
      // modules added here also need to be added in the .vscodeignore file
    },
    devtool: production ? 'hidden-source-map' : 'source-map',
    infrastructureLogging: {
      level: 'log' // enables logging required for problem matchers
    },
    plugins: [
      // @ts-ignore
      new PreserveDynamicRequireWebpackPlugin(),
      new webpack.DefinePlugin({
        ___DEV___: JSON.stringify(!production)
      })
    ],
    optimization: {
      minimize: false // Ensure licenses are included in the bundle
    }
  };
  return extensionConfig;
}
module.exports = createExtensionConfig;
