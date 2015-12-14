/// <reference path="../../typings/tsd" />
var DefaultTasks = (function () {
    function DefaultTasks() {
    }
    DefaultTasks.registerTasks = function (build) {
        build.task('default', ['build']);
    };
    return DefaultTasks;
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DefaultTasks;
