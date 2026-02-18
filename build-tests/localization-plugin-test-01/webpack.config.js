'use strict';

const { LocalizationPlugin } = require('@rushstack/webpack4-localization-plugin');
const { ModuleMinifierPlugin, LocalMinifier } = require('@rushstack/webpack4-module-minifier-plugin');
const { SetPublicPathPlugin } = require('@rushstack/set-webpack-public-path-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const HtmlWebpackPlugin = require('html-webpack-plugin');

function generateConfiguration(mode, outputFolderName, webpack) {
  return {
    mode,
    entry: {
      'localization-test-A': `${__dirname}/lib-esm/indexA.js`,
      'localization-test-B': `${__dirname}/lib-esm/indexB.js`
    },
    output: {
      path: `${__dirname}/${outputFolderName}`,
      filename: '[name]_[locale]_[contenthash].js',
      chunkFilename: '[id].[name]_[locale]_[contenthash].js'
    },
    optimization: {
      minimizer: [
        new ModuleMinifierPlugin({
          minifier: new LocalMinifier()
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
          passthroughLocale: {
            usePassthroughLocale: true
          }
        },
        typingsOptions: {
          generatedTsFolder: `${__dirname}/temp/loc-json-ts`,
          sourceRoot: `${__dirname}/src`
        },
        localizationStats: {
          dropPath: `${__dirname}/temp/localization-stats.json`
        }
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
