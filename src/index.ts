'use strict';

import GulpProxy from './GulpProxy';
import { ITask } from './ITask';
import { IBuildConfig } from './IBuildConfig';
import { log } from './logging';
import defaultConfig from './config';

export { ITask } from './ITask';
export { GulpTask } from './GulpTask';
export { log, logError } from './logging';

/* tslint:disable:variable-name */
require('es6-promise').polyfill();
/* tslint:enable:variable-name */

let _taskMap = {} as { [key: string]: ITask };
let _config: IBuildConfig;

export function task(taskName: string, task: ITask): ITask {
  _taskMap[taskName] = task;

  return task;
}

export function serial(...tasks: ITask[]): ITask {
  tasks = _flatten(tasks);

  return {
    execute: () => tasks.reduce(
      (previous, current) => previous.then(() => current.execute(_config)),
      Promise.resolve()
    )
  };
}

export function parallel(...tasks: ITask[]): ITask {
  tasks = _flatten(tasks);

  return {
    execute: () => Promise.all(
      tasks.map(task => task.execute(_config))
    )
  };
}

export function initialize(gulp: any, configOverrides?: any) {
  let assign = require('object-assign');

  _config = assign({}, defaultConfig, configOverrides);
  _config.rootPath = process.cwd();
  _config.gulp = new GulpProxy(gulp);

  Object.keys(_taskMap).forEach(taskName => _registerTask(gulp, taskName, _taskMap[taskName]));
}

function _registerTask(gulp: any, taskName: string, task: ITask) {
  gulp.task(taskName, function(cb) {
    task.execute(_config).then(cb).catch((error) => {
      cb(error);
    });
  });
}

function _flatten(arr) {
  return arr.reduce((flat, toFlatten) => flat.concat(Array.isArray(toFlatten) ? _flatten(toFlatten) : toFlatten), []);
}
