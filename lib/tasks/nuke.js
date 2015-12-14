/// <reference path="../../typings/tsd" />
var BundleTasks = (function () {
    function BundleTasks() {
    }
    BundleTasks.registerTasks = function (build, options) {
        var paths = options.paths;
        var del = require('del');
        build.task('nuke', function (cb) {
            return del([
                paths.libFolder,
                paths.coverageFolder
            ]);
        });
    };
    return BundleTasks;
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = BundleTasks;
