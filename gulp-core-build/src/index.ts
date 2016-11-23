'use strict';

/* tslint:disable:max-line-length no-any */

import * as path from 'path';

import { GulpTask } from './tasks/GulpTask';
import { GulpProxy } from './GulpProxy';
import { IExecutable } from './IExecutable';
import { IBuildConfig } from './IBuildConfig';
import { CleanTask } from './tasks/CleanTask';
import { args } from './State';
export { IExecutable } from './IExecutable';
import { initialize as initializeLogging, markTaskCreationTime, generateGulpError, setWatchMode } from './logging';
import { getFlagValue, setConfigDefaults } from './config';
import * as gulp from 'gulp';

export * from './IBuildConfig';
export * from './logging';
export * from './tasks/CopyTask';
export * from './tasks/GenerateShrinkwrapTask';
export * from './tasks/GulpTask';
export * from './tasks/CleanTask';
export * from './tasks/ValidateShrinkwrapTask';

/* tslint:disable:variable-name */
require('es6-promise').polyfill();
/* tslint:enable:variable-name */

const packageJSON: any = require(path.resolve(process.cwd(), 'package.json'));
const _taskMap: { [key: string]: IExecutable } = {};
const _uniqueTasks: IExecutable[] = [];

const packageFolder: string =
  (packageJSON.directories && packageJSON.directories.packagePath) ?
  packageJSON.directories.packagePath : '';

let _buildConfig: IBuildConfig = {
  packageFolder,
  srcFolder: 'src',
  distFolder: path.join(packageFolder, 'dist'),
  libAMDFolder: undefined,
  libFolder: path.join(packageFolder, 'lib'),
  tempFolder: 'temp',
  properties: {},
  relogIssues: getFlagValue('relogIssues', true),
  showToast: getFlagValue('showToast', true),
  buildSuccessIconPath: path.resolve(__dirname, 'pass.png'),
  buildErrorIconPath: path.resolve(__dirname, 'fail.png'),
  verbose: getFlagValue('verbose', false),
  production: getFlagValue('production', false),
  args: args,
  shouldWarningsFailBuild: false
};

/**
 * Merges the given build config settings into existing settings.
 *
 * @param  {IBuildConfig} The build config settings.
 */
export function setConfig(config: IBuildConfig): void {
  /* tslint:disable:typedef */
  const objectAssign = require('object-assign');
  /* tslint:enable:typedef */

  _buildConfig = objectAssign({}, _buildConfig, config);
}

/**
 * Merges the given build config settings into existing settings.
 *
 * @param  {IBuildConfig} The build config settings.
 */
export function mergeConfig(config: IBuildConfig): void {
  /* tslint:disable:typedef */
  const merge = require('lodash.merge');
  /* tslint:enable:typedef */

  _buildConfig = merge({}, _buildConfig, config);
}

/**
 * Replaces the build config.
 *
 * @param  {IBuildConfig} config
 */
export function replaceConfig(config: IBuildConfig): void {
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
 * The callback interface for a custom task definition.
 * The task should either return a Promise, a stream, or call the
 * callback function (passing in an object value if there was an error).
 */
export interface ICustomGulpTask {
  (gulp: gulp.Gulp | GulpProxy, buildConfig: IBuildConfig, done: (failure?: Object) => void):
    Promise<Object> | NodeJS.ReadWriteStream | void;
}

class CustomTask extends GulpTask<void> {
  private _fn: ICustomGulpTask;
  constructor(name: string, fn: ICustomGulpTask) {
    super();
    this.name = name;
    this._fn = fn.bind(this);
  }

  public executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (failure?: Object) => void):
    Promise<Object> | NodeJS.ReadWriteStream | void {
    return this._fn(gulp, getConfig(), completeCallback);
  }
}

/**
 * Creates a new subtask from a function callback. Useful as a shorthand way
 * of defining tasks directly in a gulpfile.
 *
 * @param {string} taskName - the name of the task, appearing in build logs
 * @param {boolean} addCommandLine - true if this task should be registered to the command line
 * @param {ICustomGulpTask} fn - the callback function to execute when this task runs
 */
export function subTask(taskName: string, fn: ICustomGulpTask): IExecutable {
  const customTask: CustomTask = new CustomTask(taskName, fn);
  return customTask;
}

/**
 * Defines a gulp watch and maps it to a given IExecutable.
 *
 * @param  {string} watchMatch
 * @param  {IExecutable} task
 * @returns IExecutable
 */
export function watch(watchMatch: string | string[], task: IExecutable): IExecutable {
  /* tslint:disable:typedef */
  const notifier = require('node-notifier');
  /* tslint:enable:typedef */

  _trackTask(task);

  let isWatchRunning: boolean = false;
  let shouldRerunWatch: boolean = false;
  let lastError: boolean = undefined;

  return {
    execute: (buildConfig: IBuildConfig): Promise<void> => {

      setWatchMode();
      buildConfig.gulp.watch(watchMatch, _runWatch);

      function _runWatch(): void {
        if (isWatchRunning) {
          shouldRerunWatch = true;
        } else {
          isWatchRunning = true;

          _executeTask(task, buildConfig)
            .then(() => {
              if (buildConfig.showToast && lastError) {
                lastError = undefined;

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

      function _finalizeWatch(): void {
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
  const flatTasks: IExecutable[] = <IExecutable[]>_flatten(tasks);

  for (const task of flatTasks) {
    _trackTask(task);
  }

  return {
    execute: (buildConfig: IBuildConfig): Promise<void> => {
      let output: Promise<void> = Promise.resolve<void>();

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
  const flattenTasks: IExecutable[] = _flatten<IExecutable>(tasks);

  for (const task of flattenTasks) {
    _trackTask(task);
  }

  return {
    execute: (buildConfig: IBuildConfig): Promise<any> => {
      return new Promise<void[]>((resolve, reject) => {
        const promises: Promise<void>[] = [];
        for (const task of flattenTasks) {
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
export function initialize(gulp: gulp.Gulp): void {
  _buildConfig.rootPath = process.cwd();
  _buildConfig.gulp = new GulpProxy(gulp);
  _buildConfig.uniqueTasks = _uniqueTasks;

  _handleCommandLineArguments();

  setConfigDefaults(_buildConfig);

  for (const task of _buildConfig.uniqueTasks) {
    if (task.beforeExecute) {
      task.beforeExecute();
    }
  }

  initializeLogging(gulp, undefined, undefined);

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
function _registerTask(gulp: gulp.Gulp, taskName: string, task: IExecutable): void {
  gulp.task(taskName, (cb) => {
    _executeTask(task, _buildConfig)
      .then(() => {
        cb();
      },
      (error: Error) => {
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

  if (task.isEnabled === undefined || task.isEnabled(buildConfig)) {
    const startTime: [number, number] = process.hrtime();

    if (buildConfig.onTaskStart && task.name) {
      buildConfig.onTaskStart(task.name);
    }

    const taskPromise: Promise<void> = task.execute(buildConfig)
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

function _trackTask(task: IExecutable): void {
  if (_uniqueTasks.indexOf(task) < 0) {
    _uniqueTasks.push(task);
  }
}

/**
 * Flattens a set of arrays into a single array.
 *
 * @param  {any} arr
 */
function _flatten<T>(arr: Array<T | T[]>): T[] {
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

function _handleCommandLineArguments(): void {
  _handleTasksListArguments();
}

function _handleTasksListArguments(): void {
  /* tslint:disable-next-line:no-string-literal */
  if (args['tasks'] || args['tasks-simple'] || args['T']) {
    global['dontWatchExit'] = true; // tslint:disable-line:no-string-literal
  }
}

export const clean: IExecutable = new CleanTask();

// Register default clean task.
task('clean', clean);
