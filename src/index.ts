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

export function config(config: IBuildConfig) {
  let assign = require('object-assign');

  _buildConfig = assign({}, _buildConfig, config);
}

export function task(taskName: string, task: ITask<any>): ITask<any> {
  _taskMap[taskName] = task;

  return task;
}

export function watch(watchMatch: string, task: ITask<any>): ITask<any> {
  return {
    config: null,
    execute: (buildConfig: IBuildConfig) => {
      buildConfig.gulp.watch(watchMatch, function(cb) {
        task.execute(buildConfig)
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

export function serial(...tasks: ITask<any>[]): ITask<void> {
  tasks = _flatten(tasks);

  return {
    config: null,
    execute: (buildConfig: IBuildConfig) => tasks.reduce(
      (previous, current) => previous.then(() => current.execute(buildConfig)),
      Promise.resolve()
    )
  };
}

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
          task.execute(buildConfig)
            .then(() => _evaluateCompletion(true))
            .catch(() => _evaluateCompletion(false));
        }
      });
    }
  };
}

export function initialize(gulp: any, configOverrides?: any) {
  _buildConfig.rootPath = process.cwd();
  _buildConfig.gulp = new GulpProxy(gulp);

  Object.keys(_taskMap).forEach(taskName => _registerTask(gulp, taskName, _taskMap[taskName]));
}

function _registerTask(gulp: any, taskName: string, task: ITask<any>) {
  let gutil = require('gulp-util');

  gulp.task(taskName, function(cb) {
    task.execute(_buildConfig)
      .then(() => {
        cb();
      })
      .catch((error) => {
        cb(new gutil.PluginError(taskName, error || 'Errors were encountered.'));
      });
  });
}

function _flatten(arr) {
  return arr.reduce((flat, toFlatten) => flat.concat(Array.isArray(toFlatten) ? _flatten(toFlatten) : toFlatten), []);
}

// Register default nuke task.
task('nuke', new NukeTask());
