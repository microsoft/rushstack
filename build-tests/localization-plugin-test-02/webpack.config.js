'use strict';

const path = require('path');
const webpack = require('webpack');

const { LocalizationPlugin } = require('@rushstack/webpack4-localization-plugin');
const { ModuleMinifierPlugin, WorkerPoolMinifier } = require('@rushstack/webpack4-module-minifier-plugin');
const { SetPublicPathPlugin } = require('@rushstack/set-webpack-public-path-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const HtmlWebpackPlugin = require('html-webpack-plugin');

function generateConfiguration(mode, outputFolderName) {
  return {
    mode: mode,
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: require.resolve('ts-loader'),
          exclude: /(node_modules)/,
          options: {
            compiler: require.resolve('typescript'),
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
      'localization-test-C': path.join(__dirname, 'src', 'indexC.ts')
    },
    output: {
      path: path.join(__dirname, outputFolderName),
      filename: '[name]_[locale]_[contenthash].js',
      chunkFilename: '[id].[name]_[locale]_[contenthash].js'
    },
    optimization: {
      minimizer: [
        new ModuleMinifierPlugin({
          minifier: new WorkerPoolMinifier({
            verbose: true
          }),
          sourceMap: true,
          usePortableModules: true,
          compressAsyncImports: true
        })
      ]
    },
    devtool: 'source-map',
    plugins: [
      new webpack.optimize.ModuleConcatenationPlugin(),
      new webpack.IgnorePlugin({
        resourceRegExp: /^non-existent$/
      }),
      new LocalizationPlugin({
        localizedData: {
          defaultLocale: {
            localeName: 'en-us',
            fillMissingTranslationStrings: true
          },
          translatedStrings: {
            'es-es': {
              './src/strings1.loc.json': {
                string1: 'la primera cadena de texto'
              },
              './src/chunks/strings2.loc.json': {
                string1: 'la segunda cadena de texto'
              },
              './src/strings4.loc.json': {
                string1: '"cadena de texto con comillas"'
              },
              './src/strings5.resx': './localization/es-es/strings5.resx'
            }
          },
          passthroughLocale: {
            usePassthroughLocale: true,
            passthroughLocaleName: 'default'
          },
          normalizeResxNewlines: 'crlf',
          ignoreMissingResxComments: true
        },
        typingsOptions: {
          generatedTsFolder: path.resolve(__dirname, 'temp', 'loc-json-ts'),
          sourceRoot: path.resolve(__dirname, 'src'),
          processComment: (comment) => (comment ? `${comment} (processed)` : comment)
        },
        localizationStats: {
          dropPath: path.resolve(__dirname, 'temp', 'localization-stats.json')
        },
        ignoreString: (filePath, stringName) => stringName === '__IGNORED_STRING__'
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
          useAssetName: true
        }
      }),
      new HtmlWebpackPlugin()
    ]
  };
}

module.exports = [
  generateConfiguration('development', 'dist-dev'),
  generateConfiguration('production', 'dist-prod')
];
