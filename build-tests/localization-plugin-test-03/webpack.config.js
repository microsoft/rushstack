'use strict';
const path = require('path');
const { JsonFile, FileSystem } = require('@rushstack/node-core-library');

const { LocalizationPlugin } = require('@rushstack/webpack4-localization-plugin');
const { SetPublicPathPlugin } = require('@rushstack/set-webpack-public-path-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleMinifierPlugin, WorkerPoolMinifier } = require('@rushstack/webpack4-module-minifier-plugin');

function resolveMissingString(localeNames, localizedResourcePath) {
  debugger;
  let contextRelativePath = path.relative(__dirname, localizedResourcePath);
  contextRelativePath = contextRelativePath.replace(/\\/g, '/'); // Convert Windows paths to Unix paths
  if (!contextRelativePath.startsWith('.')) {
    contextRelativePath = `./${contextRelativePath}`;
  }

  const result = {};
  for (const localeName of localeNames) {
    const expectedCombinedStringsPath = `${__dirname}/localization/${localeName}/combinedStringsData.json`;
    try {
      const loadedCombinedStringsPath = JsonFile.load(expectedCombinedStringsPath);
      result[localeName] = loadedCombinedStringsPath[contextRelativePath];
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        // File exists, but reading failed.
        throw e;
      }
    }
  }

  return result;
}

function generateConfiguration(mode, outputFolderName, webpack) {
  return {
    mode,
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: require.resolve('ts-loader'),
          exclude: /(node_modules)/,
          options: {
            compiler: require.resolve('typescript'),
            logLevel: 'ERROR',
            configFile: `${__dirname}/tsconfig.json`
          }
        }
      ]
    },
    resolve: {
      extensions: ['.js', '.json', '.ts', '.tsx']
    },
    entry: {
      'localization-test-A': `${__dirname}/src/indexA.ts`,
      'localization-test-B': `${__dirname}/src/indexB.ts`,
      'localization-test-C': `${__dirname}/src/indexC.ts`,
      'localization-test-D': `${__dirname}/src/indexD.ts`
    },
    output: {
      path: `${__dirname}/${outputFolderName}`,
      filename: '[name]_[locale]_[contenthash].js',
      chunkFilename: '[id].[name]_[locale]_[contenthash].js'
    },
    optimization: {
      minimizer: [
        new ModuleMinifierPlugin({
          minifier: new WorkerPoolMinifier(),
          useSourceMap: true
        })
      ]
    },
    plugins: [
      new webpack.optimize.ModuleConcatenationPlugin(),
      new LocalizationPlugin({
        localizedData: {
          defaultLocale: {
            localeName: 'en-us'
          },
          translatedStrings: {
            'es-es': {
              './src/strings1.loc.json': {
                string1: 'la primera cadena de texto'
              },
              './src/chunks/strings2.loc.json': './localization/es-es/chunks/strings2.loc.json',
              './src/strings4.loc.json': {
                string1: '"cadena de texto con comillas"'
              },
              './src/strings5.resx': {
                string1: 'La primera cadena de texto RESX',
                stringWithQuotes: '"cadena de texto RESX con comillas"'
              },
              './src/chunks/strings6.resx': {
                string: 'cadena de texto RESX'
              },
              './src/strings7.resjson': {
                string: 'cadena resjson'
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
          generatedTsFolder: `${__dirname}/temp/loc-json-ts`,
          secondaryGeneratedTsFolders: ['lib-commonjs'],
          sourceRoot: `${__dirname}/src`,
          exportAsDefault: true
        },
        localizationStats: {
          dropPath: `${__dirname}/temp/localization-stats.json`
        },
        globsToIgnore: ['**/invalid-strings.loc.json']
      }),
      new BundleAnalyzerPlugin({
        openAnalyzer: false,
        analyzerMode: 'static',
        reportFilename: `${__dirname}/temp/stats.html`,
        generateStatsFile: true,
        statsFilename: `${__dirname}/temp/stats.json`,
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

module.exports = ({ webpack }) => [
  generateConfiguration('development', 'dist-dev', webpack),
  generateConfiguration('production', 'dist-prod', webpack)
];
