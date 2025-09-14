'use strict';

const path = require('path');
const createWebpackConfig = require('local-web-rig/profiles/app/webpack-base.config');

module.exports = function createConfig(env, argv) {
  return createWebpackConfig({
    env: env,
    argv: argv,
    projectRoot: __dirname,
    // Documentation: https://webpack.js.org/configuration/
    configOverride: {
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

        open: '/',
        // Disable HTTPS to simplify Fiddler configuration
        server: { type: 'http' },
        //hot: false,

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
