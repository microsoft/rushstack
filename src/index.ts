'use strict';

import GulpProxy from './GulpProxy';
import { IExecutable } from './IExecutable';
import { IBuildConfig } from './IBuildConfig';
import { NukeTask } from './NukeTask';
export { IExecutable } from './IExecutable';
export { GulpTask } from './GulpTask';
export { log, logError } from './logging';

/* tslint:disable:variable-name */
require('es6-promise').polyfill();
/* tslint:enable:variable-name */

let _taskMap = {} as { [key: string]: IExecutable };

let _buildConfig: IBuildConfig = {
  distFolder: 'dist',
  libAMDFolder: null,
  libFolder: 'lib',
  tempFolder: 'temp',
  properties: {}
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
 * Defines a gulp task and maps it to a given IExecutable.
 *
 * @param  {string} taskName
 * @param  {IExecutable} task
 * @returns IExecutable
 */
export function task(taskName: string, task: IExecutable): IExecutable {
  _taskMap[taskName] = task;

  return task;
}

/**
 * Defines a gulp watch and maps it to a given IExecutable.
 *
 * @param  {string} watchMatch
 * @param  {IExecutable} task
 * @returns IExecutable
 */
export function watch(watchMatch: string, task: IExecutable): IExecutable {
  return {
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
 * Takes in IExecutables as arguments and returns an IExecutable that will execute them in serial.
 *
 * @param  {IExecutable[]} ...tasks
 * @returns IExecutable
 */
export function serial(...tasks: IExecutable[]): IExecutable {
  tasks = _flatten(tasks);

  return {
    execute: (buildConfig: IBuildConfig) => tasks.reduce(
      (previous, current) => previous.then(() => _executeTask(current, buildConfig)),
      Promise.resolve()
    )
  };
}

/**
 * Takes in IExecutables as arguments and returns an IExecutable that will execute them in parallel.
 *
 * @param  {IExecutable[]} ...tasks
 * @returns IExecutable
 */
export function parallel(...tasks: IExecutable[]): IExecutable {
  tasks = _flatten(tasks);

  return {
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
 * Registers a given gulp task given a name and an IExecutable.
 *
 * @param  {any} gulp
 * @param  {string} taskName
 * @param  {IExecutable} task
 */
function _registerTask(gulp: any, taskName: string, task: IExecutable) {
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
 * Executes a given IExecutable.
 *
 * @param  {IExecutable} task
 * @param  {IBuildConfig} buildConfig
 * @returns Promise
 */
function _executeTask(task: IExecutable, buildConfig: IBuildConfig): Promise<any> {
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
