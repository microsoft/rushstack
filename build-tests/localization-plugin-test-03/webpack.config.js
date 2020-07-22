'use strict';

const path = require('path');
const webpack = require('webpack');
const { JsonFile } = require('@rushstack/node-core-library');

const { LocalizationPlugin } = require('@rushstack/localization-plugin');
const { SetPublicPathPlugin } = require('@rushstack/set-webpack-public-path-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const HtmlWebpackPlugin = require('html-webpack-plugin');

function resolveMissingString(localeNames, localizedResourcePath) {
  let contextRelativePath = path.relative(__dirname, localizedResourcePath);
  contextRelativePath = contextRelativePath.replace(/\\/g, '/'); // Convert Windows paths to Unix paths
  if (!contextRelativePath.startsWith('.')) {
    contextRelativePath = `./${contextRelativePath}`;
  }

  const result = {};
  for (const localeName of localeNames) {
    const expectedCombinedStringsPath = path.resolve(__dirname, 'localization', localeName, 'combinedStringsData.json');
    try {
      const loadedCombinedStringsPath = JsonFile.load(expectedCombinedStringsPath);
      result[localeName] = loadedCombinedStringsPath[contextRelativePath];
    } catch (e) {
      if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') {
        // File exists, but reading failed.
        throw e;
      }
    }
  }
  return result;
}

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
      'localization-test-C': path.join(__dirname, 'src', 'indexC.ts'),
      'localization-test-D': path.join(__dirname, 'src', 'indexD.ts')
    },
    output: {
      path: path.join(__dirname, outputFolderName),
      filename: '[name]_[locale]_[contenthash].js',
      chunkFilename: '[id].[name]_[locale]_[contenthash].js'
    },
    optimization: {
      minimize: true
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
                "string1": "la primera cadena de texto"
              },
              "./src/chunks/strings2.loc.json": "./localization/es-es/chunks/strings2.loc.json",
              "./src/strings4.loc.json": {
                "string1": "\"cadena de texto con comillas\""
              },
              "./src/strings5.resx": {
                "string1": "La primera cadena de texto RESX",
                "stringWithQuotes": "\"cadena de texto RESX con comillas\""
              },
              "./src/chunks/strings6.resx": {
                "string": "cadena de texto RESX"
              }
            }
          },
          resolveMissingTranslatedStrings: resolveMissingString,
          passthroughLocale: {
            usePassthroughLocale: true
          },
          pseudolocales: {
            'qps-ploca': {
              append: '',
              prepend: ''
            },
            'qps-ploc': {
              append: '##--!!]',
              prepend: '[!!--##'
            }
          },
          normalizeResxNewlines: 'lf'
        },
        typingsOptions: {
          generatedTsFolder: path.resolve(__dirname, 'temp', 'loc-json-ts'),
          sourceRoot: path.resolve(__dirname, 'src'),
          exportAsDefault: true
        },
        localizationStats: {
          dropPath: path.resolve(__dirname, 'temp', 'localization-stats.json')
        }
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
  generateConfiguration('production', 'dist-prod'),
];
