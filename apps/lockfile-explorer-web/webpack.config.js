'use strict';

const path = require('path');
const createWebpackConfig = require('@rushstack/heft-web-rig/profiles/app/webpack-base.config');

module.exports = function createConfig(env, argv) {
  return createWebpackConfig({
    env: env,
    argv: argv,
    projectRoot: __dirname,
    // Documentation: https://webpack.js.org/configuration/
    configOverride: {
      entry: {
        app: { import: './lib/start' },
        shared: { import: './lib/shared', library: { type: 'umd' } }
      },
      output: {
        filename: '[name].js',
        path: __dirname + '/dist',
        globalObject: 'this'
      },
      optimization: {
        splitChunks: {
          // We don't want to split common code into chunks as we need a seperate
          // shared.js and app.js file that can act independently from each other
          chunks() {
            return false;
          }
        }
      },
      resolve: {
        alias: {
          // Don't rebundle this large library
          '@rushstack/rush-themed-ui': '@rushstack/rush-themed-ui/dist/rush-themed-ui.js'
        }
      },
      performance: {
        hints: env.production ? 'error' : false
        // This specifies the bundle size limit that will trigger Webpack's warning saying:
        // "The following entrypoint(s) combined asset size exceeds the recommended limit."
        // maxEntrypointSize: 500000,
        // maxAssetSize: 500000
      },
      devServer: {
        port: 8096,
        static: {
          directory: path.join(__dirname, 'dist')
        },
        client: {
          webSocketURL: {
            port: 8096
          }
        }
      }
    }
  });
};
