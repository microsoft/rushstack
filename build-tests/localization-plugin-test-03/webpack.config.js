'use strict';

const path = require('path');
const webpack = require('webpack');

const { LocalizationPlugin } = require('@rushstack/localization-plugin');
const { SetPublicPathPlugin } = require('@microsoft/set-webpack-public-path-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const HtmlWebpackPlugin = require('html-webpack-plugin');

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
        localizedData: {
          defaultLocale: {
            localeName: 'en-us'
          },
          translatedStrings: {
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
              },
              "./src/strings5.resx": {
                "string1": "La primera cadena RESX",
                "stringWithQuotes": "\"Cadena RESX con comillas\""
              },
              ".\\src\\chunks\\strings6.resx": {
                "string": "cadena RESX"
              }
            }
          },
          passthroughLocale: {
            usePassthroughLocale: true
          },
          pseudoLocales: {
            'qps-ploca': {
              append: '',
              prepend: ''
            },
            'qps-ploc': {
              append: '##--!!]',
              prepend: '[!!--##'
            }
          }
        },
        exportAsDefault: true,
        typingsOptions: {
          generatedTsFolder: path.resolve(__dirname, 'temp', 'loc-json-ts'),
          sourceRoot: path.resolve(__dirname, 'src')
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
      }),
      new HtmlWebpackPlugin()
    ]
  };

  return configuration;
}
