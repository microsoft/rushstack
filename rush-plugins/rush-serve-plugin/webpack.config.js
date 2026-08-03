'use strict';

const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const dashboardPackageFolder = path.dirname(require.resolve('@rushstack/rush-serve-dashboard/package.json'));

function createWebpackConfig({ production }) {
  return ['lib-commonjs', 'lib-esm'].map((outputFolderName) => ({
    mode: production ? 'production' : 'development',
    target: 'web',
    devtool: 'source-map',
    experiments: {
      css: true
    },
    entry: [
      path.join(dashboardPackageFolder, 'lib-esm', 'styles', 'dashboard.css'),
      path.join(dashboardPackageFolder, 'lib-esm', 'styles', 'top-bar.css'),
      path.join(dashboardPackageFolder, 'lib-esm', 'styles', 'selection-bar.css'),
      path.join(dashboardPackageFolder, 'lib-esm', 'styles', 'table-view.css'),
      path.join(dashboardPackageFolder, 'lib-esm', 'styles', 'graph-view.css'),
      path.join(dashboardPackageFolder, 'lib-esm', 'styles', 'terminal-pane.css'),
      path.join(dashboardPackageFolder, 'lib-esm', 'dashboard.js')
    ],
    module: {
      rules: [
        {
          test: /\.css$/i,
          type: 'css'
        }
      ]
    },
    output: {
      path: path.join(__dirname, outputFolderName, 'dashboard'),
      filename: 'dashboard.js',
      cssFilename: 'dashboard.css'
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: 'dashboard.html',
        inject: 'body',
        scriptLoading: 'module',
        template: path.join(dashboardPackageFolder, 'lib-esm', 'dashboard.html')
      })
    ]
  }));
}

module.exports = createWebpackConfig;
