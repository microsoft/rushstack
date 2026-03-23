'use strict';

const { LocalizationPlugin } = require('@rushstack/webpack4-localization-plugin');
const { ModuleMinifierPlugin, WorkerPoolMinifier } = require('@rushstack/webpack4-module-minifier-plugin');
const { SetPublicPathPlugin } = require('@rushstack/set-webpack-public-path-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const HtmlWebpackPlugin = require('html-webpack-plugin');

function generateConfiguration(mode, outputFolderName, webpack) {
  return {
    mode: mode,
    entry: {
      'localization-test-A': `${__dirname}/lib-esm/indexA.js`,
      'localization-test-B': `${__dirname}/lib-esm/indexB.js`,
      'localization-test-C': `${__dirname}/lib-esm/indexC.js`
    },
    output: {
      path: `${__dirname}/${outputFolderName}`,
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
        localizationStats: {
          dropPath: `${__dirname}/temp/localization-stats.json`
        },
        ignoreString: (filePath, stringName) => stringName === '__IGNORED_STRING__'
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
