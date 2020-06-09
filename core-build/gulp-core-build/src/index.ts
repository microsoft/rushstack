// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

if (process.argv.indexOf('--no-color') === -1) {
  process.argv.push('--color');
}

import * as path from 'path';

import { GulpTask } from './tasks/GulpTask';
import { GulpProxy } from './GulpProxy';
import { IExecutable } from './IExecutable';
import { IBuildConfig } from './IBuildConfig';
import { CleanTask } from './tasks/CleanTask';
import { CleanFlagTask } from './tasks/CleanFlagTask';
import { CopyStaticAssetsTask } from './tasks/copyStaticAssets/CopyStaticAssetsTask';
import { args, builtPackage } from './State';
export { IExecutable } from './IExecutable';
import { log, error as logError } from './logging';
import {
  initialize as initializeLogging,
  markTaskCreationTime,
  generateGulpError,
  setWatchMode
} from './logging';
import { getFlagValue } from './config';
import * as Gulp from 'gulp';
import * as notifier from 'node-notifier';
import { JestTask, _isJestEnabled } from './tasks/JestTask';

export * from './IBuildConfig';
export {
  addSuppression,
  coverageData,
  functionalTestRun,
  getErrors,
  getWarnings,
  TestResultState,
  warn,
  verbose,
  error,
  fileError,
  fileLog,
  fileWarning,
  reset,
  log,
  logSummary
} from './logging';
export { GCBTerminalProvider } from './utilities/GCBTerminalProvider';
export * from './tasks/CopyTask';
export * from './tasks/GenerateShrinkwrapTask';
export * from './tasks/GulpTask';
export * from './tasks/CleanTask';
export * from './tasks/CleanFlagTask';
export * from './tasks/ValidateShrinkwrapTask';
export * from './tasks/copyStaticAssets/CopyStaticAssetsTask';
export * from './tasks/JestTask';

const _taskMap: { [key: string]: IExecutable } = {};
const _uniqueTasks: IExecutable[] = [];

const packageFolder: string =
  builtPackage.directories && builtPackage.directories.packagePath
    ? builtPackage.directories.packagePath
    : '';

let _buildConfig: IBuildConfig = {
  maxBuildTimeMs: 0, // Defaults to no timeout
  // gulp and rootPath are set to undefined here because they'll be defined in the initialize function below,
  //  but we don't want their types to be nullable because a task that uses StrictNullChecks should expect them
  //  to be defined without checking their values.
  gulp: undefined as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  rootPath: undefined as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  packageFolder,
  srcFolder: 'src',
  distFolder: path.join(packageFolder, 'dist'),
  libAMDFolder: undefined,
  libESNextFolder: undefined,
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
 * @param config - The build config settings.
 * @public
 */
export function setConfig(config: Partial<IBuildConfig>): void {
  // eslint-disable-next-line
  const objectAssign = require('object-assign');

  _buildConfig = objectAssign({}, _buildConfig, config);
}

/**
 * Merges the given build config settings into existing settings.
 *
 * @param  config - The build config settings.
 * @public
 */
export function mergeConfig(config: Partial<IBuildConfig>): void {
  // eslint-disable-next-line
  const merge = require('lodash.merge');

  _buildConfig = merge({}, _buildConfig, config);
}

/**
 * Replaces the build config.
 *
 * @param  config - The build config settings.
 * @public
 */
export function replaceConfig(config: IBuildConfig): void {
  _buildConfig = config;
}

/**
 * Gets the current config.
 * @returns the current build configuration
 * @public
 */
export function getConfig(): IBuildConfig {
  return _buildConfig;
}

/** @public */
export const cleanFlag: IExecutable = new CleanFlagTask();

/**
 * Registers an IExecutable to gulp so that it can be called from the command line
 * @param taskName - the name of the task, can be called from the command line (e.g. "gulp <taskName>")
 * @param taskExecutable - the executable to execute when the task is invoked
 * @returns the task parameter
 * @public
 */
export function task(taskName: string, taskExecutable: IExecutable): IExecutable {
  taskExecutable = serial(cleanFlag, taskExecutable);

  _taskMap[taskName] = taskExecutable;

  _trackTask(taskExecutable);

  return taskExecutable;
}

/**
 * The callback interface for a custom task definition.
 * The task should either return a Promise, a stream, or call the
 * callback function (passing in an object value if there was an error).
 * @public
 */
export interface ICustomGulpTask {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (gulp: typeof Gulp | GulpProxy, buildConfig: IBuildConfig, done?: (failure?: any) => void):
    | Promise<object>
    | NodeJS.ReadWriteStream
    | void;
}

/** @public */
class CustomTask extends GulpTask<void> {
  private _fn: ICustomGulpTask;
  public constructor(name: string, fn: ICustomGulpTask) {
    super(name);
    this._fn = fn.bind(this);
  }

  public executeTask(
    gulp: typeof Gulp | GulpProxy,
    completeCallback?: (error?: string | Error) => void
  ): Promise<object> | NodeJS.ReadWriteStream | void {
    return this._fn(gulp, getConfig(), completeCallback);
  }
}

/**
 * Creates a new subtask from a function callback. Useful as a shorthand way
 * of defining tasks directly in a gulpfile.
 *
 * @param taskName - the name of the task, appearing in build logs
 * @param fn - the callback function to execute when this task runs
 * @returns an IExecutable which can be registered to the command line with task()
 * @public
 */
export function subTask(taskName: string, fn: ICustomGulpTask): IExecutable {
  const customTask: CustomTask = new CustomTask(taskName, fn);
  return customTask;
}

/**
 * Defines a gulp watch and maps it to a given IExecutable.
 *
 * @param watchMatch - the list of files patterns to watch
 * @param taskExecutable - the task to execute when a file changes
 * @returns IExecutable
 * @public
 */
export function watch(watchMatch: string | string[], taskExecutable: IExecutable): IExecutable {
  _trackTask(taskExecutable);

  let isWatchRunning: boolean = false;
  let shouldRerunWatch: boolean = false;
  let lastError: Error | undefined = undefined;

  const successMessage: string = 'Build succeeded';
  const failureMessage: string = 'Build failed';

  return {
    execute: (buildConfig: IBuildConfig): Promise<void> => {
      return new Promise<void>(() => {
        function _runWatch(): Promise<void> {
          if (isWatchRunning) {
            shouldRerunWatch = true;
            return Promise.resolve();
          } else {
            isWatchRunning = true;

            return _executeTask(taskExecutable, buildConfig)
              .then(() => {
                if (lastError) {
                  lastError = undefined;

                  if (buildConfig.showToast) {
                    notifier.notify({
                      title: successMessage,
                      message: builtPackage ? builtPackage.name : '',
                      icon: buildConfig.buildSuccessIconPath
                    });
                  } else {
                    log(successMessage);
                  }
                }
                return _finalizeWatch();
              })
              .catch((error: Error) => {
                if (!lastError || lastError !== error) {
                  lastError = error;

                  if (buildConfig.showToast) {
                    notifier.notify({
                      title: failureMessage,
                      message: error.toString(),
                      icon: buildConfig.buildErrorIconPath
                    });
                  } else {
                    log(failureMessage);
                  }
                }

                return _finalizeWatch();
              });
          }
        }

        function _finalizeWatch(): Promise<void> {
          isWatchRunning = false;

          if (shouldRerunWatch) {
            shouldRerunWatch = false;
            return _runWatch();
          }
          return Promise.resolve();
        }

        setWatchMode();
        buildConfig.gulp.watch(watchMatch, _runWatch);

        _runWatch().catch(console.error);
      });
    }
  };
}

/**
 * Takes in IExecutables as arguments and returns an IExecutable that will execute them in serial.
 * @public
 */
export function serial(...tasks: (IExecutable[] | IExecutable)[]): IExecutable {
  const flatTasks: IExecutable[] = _flatten(tasks).filter((taskExecutable) => {
    // eslint-disable-next-line @rushstack/no-null
    return taskExecutable !== null && taskExecutable !== undefined;
  });

  for (const flatTask of flatTasks) {
    _trackTask(flatTask);
  }

  return {
    execute: (buildConfig: IBuildConfig): Promise<void> => {
      let output: Promise<void> = Promise.resolve();

      for (const taskExecutable of flatTasks) {
        output = output.then(() => _executeTask(taskExecutable, buildConfig));
      }

      return output;
    }
  };
}

/**
 * Takes in IExecutables as arguments and returns an IExecutable that will execute them in parallel.
 * @public
 */
export function parallel(...tasks: (IExecutable[] | IExecutable)[]): IExecutable {
  const flatTasks: IExecutable[] = _flatten<IExecutable>(tasks).filter((taskExecutable) => {
    // eslint-disable-next-line @rushstack/no-null
    return taskExecutable !== null && taskExecutable !== undefined;
  });

  for (const flatTask of flatTasks) {
    _trackTask(flatTask);
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: (buildConfig: IBuildConfig): Promise<any> => {
      return new Promise<void[]>((resolve, reject) => {
        const promises: Promise<void>[] = [];
        for (const taskExecutable of flatTasks) {
          promises.push(_executeTask(taskExecutable, buildConfig));
        }

        // Use promise all to make sure errors are propagated correctly
        Promise.all<void>(promises).then(resolve, reject);
      });
    }
  };
}

/**
 * Initializes the gulp tasks.
 * @public
 */
export function initialize(gulp: typeof Gulp): void {
  _buildConfig.rootPath = process.cwd();
  _buildConfig.gulp = new GulpProxy(gulp);
  _buildConfig.uniqueTasks = _uniqueTasks;
  _buildConfig.jestEnabled = _isJestEnabled(_buildConfig.rootPath);

  _handleCommandLineArguments();

  for (const uniqueTask of _buildConfig.uniqueTasks) {
    if (uniqueTask.onRegister) {
      uniqueTask.onRegister();
    }
  }

  initializeLogging(gulp, getConfig(), undefined, undefined);

  Object.keys(_taskMap).forEach((taskName) => _registerTask(gulp, taskName, _taskMap[taskName]));

  markTaskCreationTime();
}

/**
 * Registers a given gulp task given a name and an IExecutable.
 */
function _registerTask(gulp: typeof Gulp, taskName: string, taskExecutable: IExecutable): void {
  gulp.task(taskName, (cb) => {
    const maxBuildTimeMs: number =
      taskExecutable.maxBuildTimeMs === undefined
        ? _buildConfig.maxBuildTimeMs
        : taskExecutable.maxBuildTimeMs;
    const timer: NodeJS.Timer | undefined =
      maxBuildTimeMs === 0
        ? undefined
        : setTimeout(() => {
            logError(
              `Build ran for ${maxBuildTimeMs} milliseconds without completing. Cancelling build with error.`
            );
            cb(new Error('Timeout'));
          }, maxBuildTimeMs);
    _executeTask(taskExecutable, _buildConfig).then(
      () => {
        if (timer) {
          clearTimeout(timer);
        }

        cb();
      },
      (error: Error) => {
        if (timer) {
          clearTimeout(timer);
        }

        cb(generateGulpError(error));
      }
    );
  });
}

/**
 * Executes a given IExecutable.
 */
function _executeTask(taskExecutable: IExecutable, buildConfig: IBuildConfig): Promise<void> {
  // Try to fallback to the default task if provided.
  if (taskExecutable && !taskExecutable.execute) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((taskExecutable as any).default) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      taskExecutable = (taskExecutable as any).default;
    }
  }

  // If the task is missing, throw a meaningful error.
  if (!taskExecutable || !taskExecutable.execute) {
    return Promise.reject(
      new Error(
        `A task was scheduled, but the task was null. This probably means the task wasn't imported correctly.`
      )
    );
  }

  if (taskExecutable.isEnabled === undefined || taskExecutable.isEnabled(buildConfig)) {
    const startTime: [number, number] = process.hrtime();

    if (buildConfig.onTaskStart && taskExecutable.name) {
      buildConfig.onTaskStart(taskExecutable.name);
    }

    const taskPromise: Promise<void> = taskExecutable.execute(buildConfig).then(
      () => {
        if (buildConfig.onTaskEnd && taskExecutable.name) {
          buildConfig.onTaskEnd(taskExecutable.name, process.hrtime(startTime));
        }
      },
      (error: Error) => {
        if (buildConfig.onTaskEnd && taskExecutable.name) {
          buildConfig.onTaskEnd(taskExecutable.name, process.hrtime(startTime), error);
        }

        return Promise.reject(error);
      }
    );

    return taskPromise;
  }

  // No-op otherwise.
  return Promise.resolve();
}

function _trackTask(taskExecutable: IExecutable): void {
  if (_uniqueTasks.indexOf(taskExecutable) < 0) {
    _uniqueTasks.push(taskExecutable);
  }
}

/**
 * Flattens a set of arrays into a single array.
 */
function _flatten<T>(oArr: (T | T[])[]): T[] {
  const output: T[] = [];

  function traverse(arr: (T | T[])[]): void {
    for (let i: number = 0; i < arr.length; ++i) {
      if (Array.isArray(arr[i])) {
        traverse(arr[i] as T[]);
      } else {
        output.push(arr[i] as T);
      }
    }
  }

  traverse(oArr);

  return output;
}

function _handleCommandLineArguments(): void {
  _handleTasksListArguments();
}

function _handleTasksListArguments(): void {
  /* eslint-disable dot-notation */
  if (args['tasks'] || args['tasks-simple'] || args['T']) {
    global['dontWatchExit'] = true;
  }
  if (args['h']) {
    // we are showing a help command prompt via yargs or ts-command-line
    global['dontWatchExit'] = true;
  }
  /* eslint-enable dot-notation */
}

/** @public */
export const clean: IExecutable = new CleanTask();

/** @public */
export const copyStaticAssets: CopyStaticAssetsTask = new CopyStaticAssetsTask();

/** @public */
export const jest: JestTask = new JestTask();

// Register default clean task.
task('clean', clean);
