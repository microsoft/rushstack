'use strict';

const path = require('path');
const webpack = require('webpack');

const { LocalizationPlugin } = require('@rushstack/localization-plugin');
const { SetPublicPathPlugin } = require('@microsoft/set-webpack-public-path-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

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
            compiler: require.resolve('@microsoft/rush-stack-compiler-3.5/node_modules/typescript'),
            logLevel: 'ERROR',
            configFile: path.resolve(__dirname, 'tsconfig.json')
          }
        }
      ]
    },
    resolve: {
      extensions: ['.js', '.jsx', '.json', '.ts', '.tsx']
    },
    entry: {
      'localization-test-A': path.join(__dirname, 'src', 'indexA.ts'),
      'localization-test-B': path.join(__dirname, 'src', 'indexB.ts'),
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
            "./src/strings1.loc.json": {
              "string1": "the first string"
            },
            "./src/chunks/strings2.loc.json": {
              "string1": "the second string"
            },
            "./src/strings3.loc.json": {
              "string1": "the third string",
              "string2": "the fourth string",
              "string3": "UNUSED STRING!"
            },
            "./src/strings4.loc.json": {
              "string1": "\"String with quotemarks\""
            }
          },
          "es-es": {
            "./src/strings1.loc.json": {
              "string1": "la primera cadena"
            },
            "./src/chunks/strings2.loc.json": {
              "string1": "la segunda cadena"
            },
            "./src/strings3.loc.json": {
              "string1": "la tercera cadena",
              "string2": "la cuarta cadena",
              "string3": "UNUSED STRING!"
            },
            "./src/strings4.loc.json": {
              "string1": "\"Cadena con comillas\""
            }
          }
        },
        defaultLocale: {
          usePassthroughLocale: true
        },
        serveLocale: {
          locale: 'en-us'
        },
        localizationStatsDropPath: path.resolve(__dirname, 'temp', 'localization-stats.json')
      }),
      new BundleAnalyzerPlugin({
        openAnalyzer: false,
        analyzerMode: 'static',
        reportFilename: path.resolve(__dirname, 'temp', 'stats.html'),
        generateStatsFile: true,
        statsFilename: path.resolve(__dirname, 'temp', 'stats.json'),
        logLevel: 'error'
      }),
      new SetPublicPathPlugin({
        scriptName: {
          name: '[name]_[locale]_[contenthash].js',
          isTokenized: true
        }
      })
    ]
  };

  return configuration;
}
