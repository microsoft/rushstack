'use strict';

const path = require('path');
const Autoprefixer = require('autoprefixer');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleMinifierPlugin, WorkerPoolMinifier } = require('@rushstack/webpack4-module-minifier-plugin');

/**
 * If the "--production" command-line parameter is specified when invoking Heft, then the
 * "production" function parameter will be true.  You can use this to enable bundling optimizations.
 */
function createWebpackConfig({ production }) {
  const webpackConfig = {
    // Documentation: https://webpack.js.org/configuration/mode/
    mode: production ? 'production' : 'development',
    module: {
      rules: [
        {
          test: /\.s?css$/,
          exclude: /node_modules/,
          use: [
            // Creates `style` nodes from JS strings
            'style-loader',
            // Translates CSS into CommonJS
            {
              loader: 'css-loader',
              options: {
                importLoaders: 2,
                modules: true
              }
            },
            // Autoprefix CSS
            {
              loader: 'postcss-loader',
              options: {
                postcssOptions: {
                  plugins: [new Autoprefixer()]
                }
              }
            }
          ]
        }
      ]
    },
    entry: {
      app: path.join(__dirname, 'lib-esm', 'index.js'),

      // Put these libraries in a separate vendor bundle
      vendor: ['react', 'react-dom']
    },
    output: {
      path: path.join(__dirname, 'dist'),
      filename: '[name]_[contenthash].js'
    },
    performance: {
      // This specifies the bundle size limit that will trigger Webpack's warning saying:
      // "The following entrypoint(s) combined asset size exceeds the recommended limit."
      maxEntrypointSize: 250000,
      maxAssetSize: 250000
    },
    devtool: production ? undefined : 'source-map',
    plugins: [
      // See here for documentation: https://github.com/jantimon/html-webpack-plugin
      new HtmlWebpackPlugin({
        template: 'assets/index.html'
      })
    ],
    optimization: {
      minimizer: [
        new ModuleMinifierPlugin({
          minifier: new WorkerPoolMinifier(),
          useSourceMap: true
        })
      ]
    }
  };

  return webpackConfig;
}

module.exports = createWebpackConfig;
