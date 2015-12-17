/// <reference path="../../typings/tsd" />

import { IBundleOptions } from '../options/bundle';
let chalk = require('chalk');
let path = require('path');
let shouldMinify = process.argv.indexOf('--production') > -1;
let webpack = require('webpack');

export default class BundleTasks {
  public static registerTasks(build: any, options: IBundleOptions) {
    let gulp = build.gulp;

    build.task('bundle', [ 'build' ], (cb) => {
      if (options.entries && options.entries.length) {
        let remainingEntries = options.entries.length;

        options.entries.forEach(bundle => {

          webpack(
            BundleTasks._buildWebpackConfig(build, bundle),
            (error, stats) => {
              if (error) {
                build.logError(error);
                throw error;
              }
              remainingEntries--;
              build.log(`Bundled ${ chalk.magenta(bundle.outputPath) }`);

              if (!remainingEntries) {
                cb();
              }

            });
        });
      }
    });

    build.task('bundle-watch', ['bundle'], () => {
      gulp.watch(options.paths.sourceMatch, ['serve-reload']);
    });
  }

  private static _buildWebpackConfig(build, bundle) {
    let fullOutputPath = path.join(build.rootDir, bundle.outputPath);
    let config = {
      context: build.rootDir,
      entry: bundle.entry,
      devtool: 'source-map',
      output: {
        libraryTarget: 'umd',
        path: path.dirname(fullOutputPath),
        filename: path.basename(fullOutputPath)
      },
      externals: bundle.exclude.map(excludeEntry => ({ [excludeEntry]: { amd: excludeEntry, commonjs: excludeEntry }})),
      plugins: []
    };

    if (shouldMinify) {
      config.plugins.push(new webpack.optimize.UglifyJsPlugin({minimize: true}));
    }

    build.logVerbose(JSON.stringify(config, null, 2));

    return config;
  }
}
