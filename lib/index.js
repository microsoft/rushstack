/// <reference path="../typings/tsd" />
'use strict';
var runSequence = require('run-sequence');
var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var chalk = require('chalk');
var isVerbose = process.argv.indexOf('--verbose') > -1;
var build = {
    rootDir: null,
    gulp: null,
    preDependencies: {},
    dependencies: {},
    postDependencies: {},
    config: {},
    initializeTasks: function (gulp, userOptions, buildPath) {
        this.gulp = gulp;
        this.rootDir = process.cwd();
        // Initialize runSequence.
        runSequence = runSequence.use(gulp);
        // Fetch tasks and options dynamically.
        var tasks = requireDir(path.resolve(__dirname, './tasks'));
        var localTasks = buildPath ? requireDir(path.resolve(buildPath, 'tasks')) : {};
        var allDefaultOptions = requireDir(path.resolve(__dirname, './options'));
        var allLocalDefaultOptions = buildPath ? requireDir(path.resolve(buildPath, 'options')) : {};
        function initializeTask(taskName, task) {
            if (task.registerTasks) {
                var localDefaultOptions = allLocalDefaultOptions[taskName];
                var defaultOptions = allDefaultOptions[taskName];
                var taskOptions = _.merge({}, (localDefaultOptions || {}).default, (defaultOptions || {}).default, (userOptions || {})[taskName]);
                build.config[taskName] = taskOptions;
                task.registerTasks(build, taskOptions);
            }
        }
        // Initialize local tasks first.
        for (var taskName in localTasks) {
            if (localTasks.hasOwnProperty(taskName)) {
                initializeTask(taskName, localTasks[taskName].default);
            }
        }
        // Initialize core tasks, which need to be registered after dependencies are mapped out.
        for (var taskName in tasks) {
            if (tasks.hasOwnProperty(taskName)) {
                initializeTask(taskName, tasks[taskName].default);
            }
        }
    },
    task: function (taskName, dependencies, callback) {
        var _this = this;
        var gulp = build.gulp;
        // Support no dependencies.
        if (arguments.length === 2 && typeof dependencies === 'function') {
            callback = dependencies;
            dependencies = null;
        }
        // Merge dependencies provided with those registered.
        dependencies = (build.dependencies[taskName] || []).concat(dependencies || []);
        var preDependencies = build.preDependencies[taskName] || [];
        var postDependencies = build.postDependencies[taskName] || [];
        if (preDependencies.length || postDependencies.length) {
            var internalTask = taskName + '-complete';
            gulp.task(internalTask, callback);
            return gulp.task(taskName, function (cb) {
                var args = [];
                if (preDependencies.length) {
                    args.push(preDependencies);
                }
                if (dependencies.length) {
                    args.push(dependencies);
                }
                args.push(internalTask);
                if (postDependencies.length) {
                    args.push(postDependencies);
                }
                args.push(cb);
                runSequence.apply(_this, args);
            });
        }
        else {
            return gulp.task(taskName, dependencies, callback);
        }
    },
    doBefore: function (parentTaskName, taskName) {
        if (typeof taskName === 'object' && taskName.length) {
            // Support arrays of tasks to register.
            taskName.forEach(function (task) { return build.doBefore(task, parentTaskName); });
        }
        else {
            addToMap(parentTaskName, taskName, build.preDependencies);
        }
    },
    doDuring: function (parentTaskName, taskName) {
        if (typeof taskName === 'object' && taskName.length) {
            // Support arrays of tasks to register.
            taskName.forEach(function (task) { return build.doDuring(task, parentTaskName); });
        }
        else {
            addToMap(parentTaskName, taskName, build.dependencies);
        }
    },
    doAfter: function (parentTaskName, taskName) {
        if (typeof taskName === 'object' && taskName.length) {
            // Support arrays of tasks to register.
            taskName.forEach(function (task) { return build.doAfter(task, parentTaskName); });
        }
        else {
            addToMap(parentTaskName, taskName, build.postDependencies);
        }
    },
    log: function (message) {
        console.log(message);
    },
    logError: function (errorMessage) {
        build.log(chalk.red('Error: ') + errorMessage);
    },
    logVerbose: function (message) {
        if (isVerbose) {
            build.log(message);
        }
    }
};
function requireDir(requirePath) {
    var loadDir = require('require-dir');
    return (fs.existsSync(requirePath)) ? loadDir(requirePath) : {};
}
function addToMap(parentTaskName, taskName, map) {
    if (!map[parentTaskName]) {
        map[parentTaskName] = [];
    }
    map[parentTaskName].push(taskName);
}
module.exports = build;
