'use strict';
var GulpProxy_1 = require('./GulpProxy');
var config_1 = require('./config');
var GulpTask_1 = require('./GulpTask');
exports.GulpTask = GulpTask_1.GulpTask;
var logging_1 = require('./logging');
exports.log = logging_1.log;
exports.logError = logging_1.logError;
/* tslint:disable:variable-name */
require('es6-promise').polyfill();
/* tslint:enable:variable-name */
var _taskMap = {};
var _config;
function task(taskName, task) {
    _taskMap[taskName] = task;
    return task;
}
exports.task = task;
function serial() {
    var tasks = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        tasks[_i - 0] = arguments[_i];
    }
    tasks = _flatten(tasks);
    return {
        execute: function () { return tasks.reduce(function (previous, current) { return previous.then(function () { return current.execute(_config); }); }, Promise.resolve()); }
    };
}
exports.serial = serial;
function parallel() {
    var tasks = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        tasks[_i - 0] = arguments[_i];
    }
    tasks = _flatten(tasks);
    return {
        execute: function () { return Promise.all(tasks.map(function (task) { return task.execute(_config); })); }
    };
}
exports.parallel = parallel;
function initialize(gulp, configOverrides) {
    var assign = require('object-assign');
    _config = assign({}, config_1.default, configOverrides);
    _config.rootPath = process.cwd();
    _config.gulp = new GulpProxy_1.default(gulp);
    Object.keys(_taskMap).forEach(function (taskName) { return _registerTask(gulp, taskName, _taskMap[taskName]); });
}
exports.initialize = initialize;
function _registerTask(gulp, taskName, task) {
    gulp.task(taskName, function (cb) {
        task.execute(_config).then(cb).catch(function (error) {
            cb(error);
        });
    });
}
function _flatten(arr) {
    return arr.reduce(function (flat, toFlatten) { return flat.concat(Array.isArray(toFlatten) ? _flatten(toFlatten) : toFlatten); }, []);
}
