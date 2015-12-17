/// <reference path="../../typings/tsd" />
var chalk = require('chalk');
var path = require('path');
var shouldMinify = process.argv.indexOf('--production') > -1;
var webpack = require('webpack');
var BundleTasks = (function () {
    function BundleTasks() {
    }
    BundleTasks.registerTasks = function (build, options) {
        var gulp = build.gulp;
        build.task('bundle', ['build'], function (cb) {
            if (options.entries && options.entries.length) {
                var remainingEntries = options.entries.length;
                options.entries.forEach(function (bundle) {
                    webpack(BundleTasks._buildWebpackConfig(build, bundle), function (error, stats) {
                        if (error) {
                            build.logError(error);
                            throw error;
                        }
                        remainingEntries--;
                        build.log("Bundled " + chalk.magenta(bundle.outputPath));
                        if (!remainingEntries) {
                            cb();
                        }
                    });
                });
            }
        });
        build.task('bundle-watch', ['bundle'], function () {
            gulp.watch(options.paths.sourceMatch, ['serve-reload']);
        });
    };
    BundleTasks._buildWebpackConfig = function (build, bundle) {
        var fullOutputPath = path.join(build.rootDir, bundle.outputPath);
        var config = {
            context: build.rootDir,
            entry: bundle.entry,
            devtool: 'source-map',
            output: {
                libraryTarget: 'umd',
                path: path.dirname(fullOutputPath),
                filename: path.basename(fullOutputPath)
            },
            externals: bundle.exclude.map(function (excludeEntry) { return ((_a = {}, _a[excludeEntry] = { amd: excludeEntry, commonjs: excludeEntry }, _a)); var _a; }),
            plugins: []
        };
        if (shouldMinify) {
            config.plugins.push(new webpack.optimize.UglifyJsPlugin({ minimize: true }));
        }
        build.logVerbose(JSON.stringify(config, null, 2));
        return config;
    };
    return BundleTasks;
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = BundleTasks;
