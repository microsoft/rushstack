/// <reference path="../typings/tsd" />

'use strict';

let runSequence = require('run-sequence');
let _ = require('lodash');
let path = require('path');
let fs = require('fs');
let chalk = require('chalk');
let isVerbose = process.argv.indexOf('--verbose') > -1;

let build = {
  rootDir: null,
  gulp: null,
  preDependencies: {},
  dependencies: {},
  postDependencies: {},
  config: {},
  allTasks: {},

  initializeTasks: function(gulp, userOptions?: any, buildPath?: string) {
    this.gulp = gulp;
    this.rootDir = process.cwd();

    // Initialize runSequence.
    runSequence = runSequence.use(gulp);

    // Fetch tasks and options dynamically.
    let tasks = requireDir(path.resolve(__dirname, './tasks'));
    let localTasks = buildPath ? requireDir(path.resolve(buildPath, 'tasks')) : {};
    let allDefaultOptions = requireDir(path.resolve(__dirname, './options'));
    let allLocalDefaultOptions = buildPath ? requireDir(path.resolve(buildPath, 'options')) : {};

    function initializeTask(taskName, task) {
      if (task.registerTasks) {
        let localDefaultOptions = allLocalDefaultOptions[taskName];
        let defaultOptions = allDefaultOptions[taskName];
        let taskOptions = _.merge(
          {},
          (localDefaultOptions || {}).default,
          (defaultOptions || {}).default,
          (userOptions || {})[taskName]);

        build.config[taskName] = taskOptions;

        task.registerTasks(build, taskOptions);
      }
    }

    // Initialize local tasks first.
    for (let taskName in localTasks) {
      if (localTasks.hasOwnProperty(taskName)) {
        initializeTask(taskName, localTasks[taskName].default);
      }
    }

    // Initialize core tasks, which need to be registered after dependencies are mapped out.
    for (let taskName in tasks) {
      if (tasks.hasOwnProperty(taskName)) {
        initializeTask(taskName, tasks[taskName].default);
      }
    }

    // Now register tasks in gulp.
    for (let taskName in build.allTasks) {
      if (build.allTasks.hasOwnProperty(taskName)) {
        let task = build.allTasks[taskName];
        build._createGulpTask(task.taskName, task.dependencies, task.callback);
      }
    }
  },

  task: function(taskName, dependencies, callback) {
    // Support no dependencies.
    if (arguments.length === 2 && typeof dependencies === 'function') {
      callback = dependencies;
      dependencies = null;
    }

    if (!build.allTasks[taskName]) {
      build.allTasks[taskName] = {
        taskName: taskName,
        dependencies: dependencies,
        callback: callback
      };
    }
  },

  _createGulpTask: function(taskName, dependencies, callback) {
    let gulp = build.gulp;

    // Merge dependencies provided with those registered.
    dependencies = (build.dependencies[taskName] || []).concat(dependencies || []);

    let preDependencies = build.preDependencies[taskName] || [];
    let postDependencies = build.postDependencies[taskName] || [];

    if (preDependencies.length || postDependencies.length) {
      let internalTask = taskName + '-complete';

      gulp.task(internalTask, callback);

      return gulp.task(taskName, (cb) => {
        let args = [];

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
        runSequence.apply(this, args);
      });
    } else {
      return gulp.task(taskName, dependencies, callback);
    }
  },

  doBefore: function(parentTaskName, taskName) {
    if (typeof taskName === 'object' && taskName.length) {
      // Support arrays of tasks to register.
      taskName.forEach((task) => build.doBefore(task, parentTaskName));
    } else {
      addToMap(parentTaskName, taskName, build.preDependencies);
    }
  },

  doDuring: function(parentTaskName, taskName) {
    if (typeof taskName === 'object' && taskName.length) {
      // Support arrays of tasks to register.
      taskName.forEach((task) => build.doDuring(task, parentTaskName));
    } else {
      addToMap(parentTaskName, taskName, build.dependencies);
    }
  },

  doAfter: function(parentTaskName, taskName) {
    if (typeof taskName === 'object' && taskName.length) {
      // Support arrays of tasks to register.
      taskName.forEach((task) => build.doAfter(task, parentTaskName));
    } else {
      addToMap(parentTaskName, taskName, build.postDependencies);
    }
  },

  log: function(message) {
    console.log(message);
  },

  logError: function(errorMessage) {
    build.log(chalk.red('Error: ') + errorMessage);
  },

  logVerbose: function(message) {
    if (isVerbose) {
      build.log(message);
    }
  }

};

function requireDir(requirePath) {
  let loadDir = require('require-dir');

  return (fs.existsSync(requirePath)) ? loadDir(requirePath) : {};
}

function addToMap(parentTaskName, taskName, map) {
  if (!map[parentTaskName]) {
    map[parentTaskName] = [];
  }
  map[parentTaskName].push(taskName);
}

export = build;
