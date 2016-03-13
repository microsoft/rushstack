'use strict';

import GulpProxy from './GulpProxy';
import { ITask } from './ITask';
import { IBuildConfig } from './IBuildConfig';
import { NukeTask } from './NukeTask';
export { ITask } from './ITask';
export { GulpTask } from './GulpTask';
export { log, logError } from './logging';

/* tslint:disable:variable-name */
require('es6-promise').polyfill();
/* tslint:enable:variable-name */

let _taskMap = {} as { [key: string]: ITask<any> };

let _buildConfig: IBuildConfig = {
  distFolder: 'dist',
  libAMDFolder: null,
  libFolder: 'lib',
  tempFolder: 'temp'
};

/**
 * Configures the build param settings.
 *
 * @param  {IBuildConfig} The build config settings.
 */
export function config(config: IBuildConfig) {
  let assign = require('object-assign');

  _buildConfig = assign({}, _buildConfig, config);
}

/**
 * Defines a gulp task and maps it to a given ITask.
 *
 * @param  {string} taskName
 * @param  {ITask<any>} task
 * @returns ITask
 */
export function task(taskName: string, task: ITask<any>): ITask<any> {
  _taskMap[taskName] = task;

  return task;
}

/**
 * Defines a gulp watch and maps it to a given ITask.
 *
 * @param  {string} watchMatch
 * @param  {ITask<any>} task
 * @returns ITask
 */
export function watch(watchMatch: string, task: ITask<any>): ITask<any> {
  return {
    config: null,
    execute: (buildConfig: IBuildConfig) => {
      buildConfig.gulp.watch(watchMatch, function(cb) {
        _executeTask(task, buildConfig)
          .then(() => {
            cb();
          })
          .catch((error) => {
            cb();
          });
      });

      return Promise.resolve();
    }
  };
}

/**
 * Takes in ITasks as arguments and returns an ITask that will execute them in serial.
 *
 * @param  {ITask<any>[]} ...tasks
 * @returns ITask
 */
export function serial(...tasks: ITask<any>[]): ITask<void> {
  tasks = _flatten(tasks);

  return {
    config: null,
    execute: (buildConfig: IBuildConfig) => tasks.reduce(
      (previous, current) => previous.then(() => _executeTask(current, buildConfig)),
      Promise.resolve()
    )
  };
}

/**
 * Takes in ITasks as arguments and returns an ITask that will execute them in parallel.
 *
 * @param  {ITask<any>[]} ...tasks
 * @returns ITask
 */
export function parallel(...tasks: ITask<any>[]): ITask<any> {
  tasks = _flatten(tasks);

  return {
    config: null,
    execute: (buildConfig: IBuildConfig) => {
      return new Promise<void>((resolve, reject) => {
        let succeeded = 0;
        let failed = 0;

        function _evaluateCompletion(isSuccess: boolean) {
          isSuccess ? succeeded++ : failed++;

          if ((succeeded + failed) === tasks.length) {
            failed ? reject() : resolve();
          }
        }

        for (let task of tasks) {
          _executeTask(task, buildConfig)
            .then(() => _evaluateCompletion(true))
            .catch(() => _evaluateCompletion(false));
        }
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

  Object.keys(_taskMap).forEach(taskName => _registerTask(gulp, taskName, _taskMap[taskName]));
}

/**
 * Registers a given gulp task given a name and an ITask.
 *
 * @param  {any} gulp
 * @param  {string} taskName
 * @param  {ITask<any>} task
 */
function _registerTask(gulp: any, taskName: string, task: ITask<any>) {
  let gutil = require('gulp-util');

  gulp.task(taskName, function(cb) {
    _executeTask(task, _buildConfig)
      .then(() => {
        cb();
      })
      .catch((error) => {
        cb(new gutil.PluginError(taskName, error || 'Errors were encountered.'));
      });
  });
}

/**
 * Executes a given ITask.
 *
 * @param  {ITask<any>} task
 * @param  {IBuildConfig} buildConfig
 * @returns Promise
 */
function _executeTask(task: ITask<any>, buildConfig: IBuildConfig): Promise<any> {
  // Try to fallback to the default task if provided.
  if (task && !task.execute) {
    if ((task as any).default) {
      task = (task as any).default;
    }
  }

  // If the task is missing, throw a meaningful error.
  if (!task || !task.execute) {
    return Promise.reject(`A task was scheduled, but the task was null. This probably means the task wasn't imported correctly.`);
  }

  return task.execute(buildConfig);
}

/**
 * Flattens a set of arrays into a single array.
 *
 * @param  {any} arr
 */
function _flatten(arr) {
  return arr.reduce((flat, toFlatten) => flat.concat(Array.isArray(toFlatten) ? _flatten(toFlatten) : toFlatten), []);
}

// Register default nuke task.
task('nuke', new NukeTask());
