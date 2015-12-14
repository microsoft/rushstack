/// <reference path="../../typings/tsd" />
var TestTasks = (function () {
    function TestTasks() {
    }
    TestTasks.registerTasks = function (build, options) {
        var gulp = build.gulp;
        var paths = options.paths;
        var path = require('path');
        var server = require('karma').Server;
        var singleRun = (process.argv.indexOf('--debug') === -1);
        var matchIndex = (process.argv.indexOf('--match'));
        var matchString = (matchIndex === -1) ? '' : process.argv[matchIndex + 1];
        build.task('test', ['build'], function (cb) {
            var configPath = path.resolve(__dirname, '../../karma.conf.js');
            if (matchString) {
                build.log("Running tests that match \"" + matchString + "\"");
            }
            new server({
                configFile: configPath,
                singleRun: singleRun,
                client: {
                    mocha: {
                        grep: matchString
                    }
                }
            }, function () {
                cb();
            }).start();
        });
        build.task('test-watch', function () {
            gulp.watch([paths.sourceMatch], ['test']);
        });
    };
    return TestTasks;
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TestTasks;
