'use strict';

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

/** example config, each parameter has options for different build runtime environments */
const CONFIG = {
  reactUrl: {
    dev: 'https://cdnjs.cloudflare.com/ajax/libs/react/16.4.2/umd/react.development.js',
    production: 'https://cdnjs.cloudflare.com/ajax/libs/react/16.4.2/umd/react.production.min.js'
  },

  reactDomUrl: {
    dev: 'https://cdnjs.cloudflare.com/ajax/libs/react-dom/16.4.2/umd/react-dom.development.js',
    production: 'https://cdnjs.cloudflare.com/ajax/libs/react-dom/16.4.2/umd/react-dom.production.min.js'
  }
};

function _generateBaseWebpackConfiguration({ runtimeEnv = 'dev', isProduction = false }) {
  const webpackConfig = {
    mode: 'development',
    resolve: {
      extensions: ['.js', '.jsx', '.json']
    },
    entry: {
      'heft-test': path.join(__dirname, 'lib', 'index.js')
    },
    output: {
      path: path.join(__dirname, 'dist'),
      filename: '[name]_[contenthash].js'
    },
    externals: {
      react: 'React',
      'react-dom': 'ReactDOM'
    },
    devtool: isProduction ? undefined : 'source-map',
    plugins: [
      //webpack plugin to generate a startup index.html file
      new HtmlWebpackPlugin({
        //inject the output at the bottom of the template <body>
        inject: true,
        //uses handlebars to pass in parameters to the template
        template: `handlebars-loader!${path.join(__dirname, 'web', 'index.hbs')}`,
        chunks: {},
        templateParameters: {
          scriptsToInclude: [{ url: CONFIG.reactUrl[runtimeEnv] }, { url: CONFIG.reactDomUrl[runtimeEnv] }]
        }
      })
    ]
  };

  return webpackConfig;
}

module.exports = _generateBaseWebpackConfiguration({ runtimeEnv: 'dev', isProduction: false });
