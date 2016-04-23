'use strict';

/* tslint:disable:max-line-length */

import { GulpProxy } from './GulpProxy';
import { IExecutable } from './IExecutable';
import { IBuildConfig } from './IBuildConfig';
import { NukeTask } from './NukeTask';
import { args } from './State';
export { IExecutable } from './IExecutable';
import { initialize as initializeLogging, markTaskCreationTime, generateGulpError, setWatchMode } from './logging';
import { getFlagValue, setConfigDefaults } from './config';
import gulpType = require('gulp');

export * from './IBuildConfig';
export * from './GulpTask';
export * from './CopyTask';
export * from './NukeTask';
export * from './logging';

/* tslint:disable:variable-name */
require('es6-promise').polyfill();
/* tslint:enable:variable-name */

let path = require('path');
let packageJSON = require(path.resolve(process.cwd(), 'package.json'));

let _taskMap = {} as { [key: string]: IExecutable };
let _uniqueTasks = [];

let _buildConfig: IBuildConfig = {
  distFolder: 'dist',
  libAMDFolder: null,
  libFolder: 'lib',
  tempFolder: 'temp',
  properties: {},
  relogIssues: getFlagValue('relogIssues', true),
  showToast: getFlagValue('showToast', true),
  buildSuccessIconPath: path.resolve(__dirname, 'pass.png'),
  buildErrorIconPath: path.resolve(__dirname, 'fail.png'),
  verbose: getFlagValue('verbose', false),
  production: getFlagValue('production', false),
  args: args
};

/**
 * Merges the given build config settings into existing settings.
 *
 * @param  {IBuildConfig} The build config settings.
 */
export function setConfig(config: IBuildConfig) {
  let merge = require('lodash.merge');

  _buildConfig = merge({}, _buildConfig, config);
}

/**
 * Replaces the build config.
 *
 * @param  {IBuildConfig} config
 */
export function replaceConfig(config: IBuildConfig) {
  _buildConfig = config;
}

/**
 * Gets the current config.
 *
 * @returns IBuildConfig
 */
export function getConfig(): IBuildConfig {
  return _buildConfig;
}

/**
 * Defines a gulp task and maps it to a given IExecutable.
 *
 * @param  {string} taskName
 * @param  {IExecutable} task
 * @returns IExecutable
 */
export function task(taskName: string, task: IExecutable): IExecutable {
  _taskMap[taskName] = task;

  _trackTask(task);

  return task;
}

/**
 * Defines a gulp watch and maps it to a given IExecutable.
 *
 * @param  {string} watchMatch
 * @param  {IExecutable} task
 * @returns IExecutable
 */
export function watch(watchMatch: string | string[], task: IExecutable): IExecutable {
  const notifier = require('node-notifier');
  _trackTask(task);

  let isWatchRunning = false;
  let shouldRerunWatch = false;
  let lastError = null;

  return {
    execute: (buildConfig: IBuildConfig) => {

      setWatchMode();
      buildConfig.gulp.watch(watchMatch, _runWatch);

      function _runWatch() {
        if (isWatchRunning) {
          shouldRerunWatch = true;
        } else {
          isWatchRunning = true;

          _executeTask(task, buildConfig)
            .then(() => {
              if (buildConfig.showToast && lastError) {
                lastError = null;

                notifier.notify({
                  title: 'Build succeeded',
                  message: packageJSON.name,
                  icon: buildConfig.buildSuccessIconPath
                });
              }
              _finalizeWatch();
            })
            .catch((error) => {
              if (buildConfig.showToast) {
                if (!lastError || lastError !== error) {
                  lastError = error;
                  notifier.notify({
                    title: 'Build failed',
                    message: error,
                    icon: buildConfig.buildErrorIconPath
                  });
                }
              }
              _finalizeWatch();
            });
        }
      }

      function _finalizeWatch() {
        isWatchRunning = false;

        if (shouldRerunWatch) {
          shouldRerunWatch = false;
          _runWatch();
        }
      }

      return Promise.resolve<void>();
    }
  };
}

/**
 * Takes in IExecutables as arguments and returns an IExecutable that will execute them in serial.
 *
 * @param  {IExecutable[]} ...tasks
 * @returns IExecutable
 */
export function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable {
  let flatTasks = <IExecutable[]>_flatten(tasks);

  for (let task of flatTasks) {
    _trackTask(task);
  }

  return {
    execute: (buildConfig: IBuildConfig) => {
      let output = Promise.resolve<void>();

      for (let task of flatTasks) {
        output = output.then(() => _executeTask(task, buildConfig));
      }

      return output;
    }
  };
}

/**
 * Takes in IExecutables as arguments and returns an IExecutable that will execute them in parallel.
 *
 * @param  {IExecutable[]} ...tasks
 * @returns IExecutable
 */
export function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable {
  let flattenTasks = _flatten(tasks);

  for (let task of flattenTasks) {
    _trackTask(task);
  }

  return {
    execute: (buildConfig: IBuildConfig): Promise<void> => {
      return new Promise<any>((resolve, reject) => {
        let promises: Promise<void>[] = [];
        for (let task of flattenTasks) {
          promises.push(_executeTask(task, buildConfig));
        }

        // Use promise all to make sure errors are propagated correctly
        Promise.all<void>(promises).then(resolve, reject);
      });
    }
  };
}

/**
 * Initializes the gulp tasks.
 *
 * @param  {any} gulp
 */
export function initialize(gulp: any) {
  _buildConfig.rootPath = process.cwd();
  _buildConfig.gulp = new GulpProxy(gulp);
  _buildConfig.uniqueTasks = _uniqueTasks;

  setConfigDefaults(_buildConfig);

  initializeLogging(gulp, null, null);

  Object.keys(_taskMap).forEach(taskName => _registerTask(gulp, taskName, _taskMap[taskName]));

  markTaskCreationTime();
}

/**
 * Registers a given gulp task given a name and an IExecutable.
 *
 * @param  {any} gulp
 * @param  {string} taskName
 * @param  {IExecutable} task
 */
function _registerTask(gulp: gulpType.Gulp, taskName: string, task: IExecutable) {
  gulp.task(taskName, (cb) => {
    _executeTask(task, _buildConfig)
      .then(() => {
        cb();
      },
      (error: any) => {
        cb(generateGulpError(error));
      });
  });
}

/**
 * Executes a given IExecutable.
 *
 * @param  {IExecutable} task
 * @param  {IBuildConfig} buildConfig
 * @returns Promise
 */
function _executeTask(task: IExecutable, buildConfig: IBuildConfig): Promise<void> {
  // Try to fallback to the default task if provided.
  if (task && !task.execute) {
    if ((task as any).default) {
      task = (task as any).default;
    }
  }

  // If the task is missing, throw a meaningful error.
  if (!task || !task.execute) {
    return Promise.reject(new Error(`A task was scheduled, but the task was null. This probably means the task wasn't imported correctly.`));
  }

  if (task.isEnabled === undefined || task.isEnabled()) {
    let startTime = process.hrtime();

    if (buildConfig.onTaskStart && task.name) {
      buildConfig.onTaskStart(task.name);
    }

    let taskPromise = task.execute(buildConfig)
      .then(() => {
        if (buildConfig.onTaskEnd && task.name) {
          buildConfig.onTaskEnd(task.name, process.hrtime(startTime));
        }
      },
      (error: any) => {
        if (buildConfig.onTaskEnd && task.name) {
          buildConfig.onTaskEnd(task.name, process.hrtime(startTime), error);
        }

        return Promise.reject(error);
      });

    return taskPromise;
  }

  // No-op otherwise.
  return Promise.resolve<void>();
}

function _trackTask(task: IExecutable) {
  if (_uniqueTasks.indexOf(task) < 0) {
    _uniqueTasks.push(task);
  }
}

/**
 * Flattens a set of arrays into a single array.
 *
 * @param  {any} arr
 */
function _flatten<T>(arr: Array<T | T[]>) {
  let output: T[] = [];

  for (let toFlatten of arr) {
    if (Array.isArray(toFlatten)) {
      output = output.concat(toFlatten);
    } else {
      output.push(toFlatten);
    }
  }

  return output;
}

export let nuke = new NukeTask();

// Register default nuke task.
task('nuke', nuke);
