'use strict';

const path = require('path');
const webpack = require('webpack');

const { LocalizationPlugin } = require('@microsoft/localization-plugin');

module.exports = function(env) {
  const configuration = {
    mode: 'production',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: require.resolve('ts-loader'),
          exclude: /(node_modules)/,
          options: {
            compiler: require.resolve('@microsoft/rush-stack-compiler-3.2/node_modules/typescript'),
            logLevel: 'ERROR',
            configFile: path.resolve(__dirname, 'tsconfig.json')
          }
        }
      ]
    },
    context: path.resolve(__dirname, 'src'),
    resolve: {
      extensions: ['.js', '.jsx', '.json', '.ts', '.tsx']
    },
    entry: {
      'localization-test': path.join(__dirname, 'src', 'index.ts')
    },
    output: {
      path: path.join(__dirname, 'dist'),
      filename: '[name]_[locale]_[contenthash].js',
      chunkFilename: '[id].[name]_[locale]_[contenthash].js'
    },
    optimization: {
      minimize: false
    },
    plugins: [
      new webpack.optimize.ModuleConcatenationPlugin(),
      new LocalizationPlugin({
        localizedStrings: {
          "en-us": {
            "./strings1.loc.json": {
              "string1": "the first string"
            },
            "./strings2.loc.json": {
              "string1": "the second string"
            },
            "./strings3.loc.json": {
              "string1": "the third string",
              "string2": "the fourth string",
            }
          },
          "es-es": {
            "./strings1.loc.json": {
              "string1": "la primera cadena"
            },
            "./strings2.loc.json": {
              "string1": "la segunda cadena"
            },
            "./strings3.loc.json": {
              "string1": "la tercera cadena",
              "string2": "la cuarta cadena",
            }
          }
        }
      })
    ]
  };

  return configuration;
}
