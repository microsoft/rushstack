// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as Gulp from 'gulp';
import * as path from 'path';
// eslint-disable-next-line
const prettyTime = require('pretty-hrtime');

import { IBuildConfig } from './IBuildConfig';
import * as state from './State';
import { getFlagValue } from './config';
import { getConfig } from './index';

const WROTE_ERROR_KEY: string = '__gulpCoreBuildWroteError';

interface ILocalCache {
  warnings: string[];
  errors: string[];
  taskRun: number;
  subTasksRun: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  testsFlakyFailed: number;
  testsSkipped: number;
  taskErrors: number;
  coverageResults: number;
  coveragePass: number;
  coverageTotal: number;
  totalTaskHrTime: [number, number] | undefined;
  start?: [number, number];
  taskCreationTime?: [number, number];
  totalTaskSrc: number;
  wroteSummary: boolean;
  writingSummary: boolean;
  writeSummaryCallbacks: (() => void)[];
  watchMode?: boolean;
  fromRunGulp?: boolean;
  exitCode: number;
  writeSummaryLogs: string[];
  gulp: typeof Gulp | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gulpErrorCallback: undefined | ((err: any) => void);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gulpStopCallback: undefined | ((err: any) => void);
  errorAndWarningSuppressions: (string | RegExp)[];
  shouldLogWarningsDuringSummary: boolean;
  shouldLogErrorsDuringSummary: boolean;
}

let wiredUpErrorHandling: boolean = false;
let duringFastExit: boolean = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalInstance: any = global as any;

const localCache: ILocalCache = (globalInstance.__loggingCache = globalInstance.__loggingCache || {
  warnings: [],
  errors: [],
  testsRun: 0,
  subTasksRun: 0,
  testsPassed: 0,
  testsFailed: 0,
  testsFlakyFailed: 0,
  testsSkipped: 0,
  taskRun: 0,
  taskErrors: 0,
  coverageResults: 0,
  coveragePass: 0,
  coverageTotal: 0,
  totalTaskHrTime: undefined,
  totalTaskSrc: 0,
  wroteSummary: false,
  writingSummary: false,
  writeSummaryCallbacks: [],
  exitCode: 0,
  writeSummaryLogs: [],
  errorAndWarningSuppressions: [],
  gulp: undefined,
  gulpErrorCallback: undefined,
  gulpStopCallback: undefined,
  shouldLogErrorsDuringSummary: false,
  shouldLogWarningsDuringSummary: false,
});

if (!localCache.start) {
  localCache.start = process.hrtime();
}

function isVerbose(): boolean {
  return getFlagValue('verbose');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatError(e: any): string | undefined {
  if (!e.err) {
    if (isVerbose()) {
      return e.message + '\r\n' + e.stack;
    } else {
      return e.message;
    }
  }

  // PluginError
  if (typeof e.err.showStack === 'boolean') {
    return e.err.toString() + (e.err.stack && isVerbose() ? '\r\n' + e.err.stack : '');
  }

  // normal error
  if (e.err.stack) {
    if (isVerbose()) {
      return e.err.stack;
    } else {
      return e.err.message;
    }
  }

  // unknown (string, number, etc.)
  if (typeof Error === 'undefined') {
    if (isVerbose()) {
      return e.message + '\r\n' + e.stack;
    } else {
      return e.message;
    }
  } else {
    let output: string = String(e.err);

    try {
      output = JSON.stringify(e.err);
    } catch (e) {
      // Do nothing
    }

    if (isVerbose()) {
      return new Error(output).stack;
    } else {
      return new Error(output).message;
    }
  }
}

function afterStreamFlushed(streamName: string, callback: () => void): void {
  if (duringFastExit) {
    callback();
  } else {
    const stream: NodeJS.WritableStream = process[streamName];
    const outputWritten: boolean = stream.write('');
    if (outputWritten) {
      setTimeout(() => {
        callback();
      }, 250);
    } else {
      stream.once('drain', () => {
        setTimeout(() => {
          callback();
        }, 250);
      });
    }
  }
}

function afterStreamsFlushed(callback: () => void): void {
  afterStreamFlushed('stdout', () => {
    afterStreamFlushed('stderr', () => {
      callback();
    });
  });
}

function writeSummary(callback: () => void): void {
  localCache.writeSummaryCallbacks.push(callback);

  if (!localCache.writingSummary) {
    localCache.writingSummary = true;

    // flush the log
    afterStreamsFlushed(() => {
      const shouldRelogIssues: boolean = getFlagValue('relogIssues');
      log(colors.magenta('==================[ Finished ]=================='));

      const warnings: string[] = getWarnings();
      if (shouldRelogIssues) {
        for (let x: number = 0; x < warnings.length; x++) {
          console.error(colors.yellow(warnings[x]));
        }
      }

      if (shouldRelogIssues && (localCache.taskErrors > 0 || getErrors().length)) {
        const errors: string[] = getErrors();
        for (let x: number = 0; x < errors.length; x++) {
          console.error(colors.red(errors[x]));
        }
      }

      afterStreamsFlushed(() => {
        for (const writeSummaryString of localCache.writeSummaryLogs) {
          log(writeSummaryString);
        }
        const totalDuration: [number, number] = process.hrtime(getStart());

        const name: string = state.builtPackage.name || 'with unknown name';
        const version: string = state.builtPackage.version || 'unknown';
        log(`Project ${name} version:`, colors.yellow(version));
        log('Build tools version:', colors.yellow(state.coreBuildPackage.version || ''));
        log('Node version:', colors.yellow(process.version));
        // log('Create tasks duration:', colors.yellow(prettyTime(localCache.taskCreationTime)));
        // log('Read src tasks duration:', colors.yellow(prettyTime(localCache.totalTaskHrTime)));
        log('Total duration:', colors.yellow(prettyTime(totalDuration)));
        // log(`Tasks run: ${colors.yellow(localCache.taskRun + '')} ` +
        //     `Subtasks run: ${colors.yellow(localCache.subTasksRun + '')}`);

        if (localCache.testsRun > 0) {
          log(
            'Tests results -',
            'Passed:',
            colors.green(localCache.testsPassed + ''),
            'Failed:',
            colors.red(localCache.testsFailed + ''),
            // 'Flaky:', colors.yellow(localCache.testsFlakyFailed + ''),
            'Skipped:',
            colors.yellow(localCache.testsSkipped + '')
          );
        }

        if (localCache.coverageResults > 0) {
          log(
            'Coverage results -',
            'Passed:',
            colors.green(localCache.coveragePass + ''),
            'Failed:',
            colors.red(localCache.coverageResults - localCache.coveragePass + ''),
            'Avg. Cov.:',
            colors.yellow(Math.floor(localCache.coverageTotal / localCache.coverageResults) + '%')
          );
        }

        if (getWarnings().length) {
          log('Task warnings:', colors.yellow(getWarnings().length.toString()));
        }

        let totalErrors: number = 0;

        if (localCache.taskErrors > 0 || getErrors().length) {
          totalErrors = localCache.taskErrors + getErrors().length;
          log('Task errors:', colors.red(totalErrors + ''));
        }

        localCache.wroteSummary = true;
        const callbacks: (() => void)[] = localCache.writeSummaryCallbacks;
        localCache.writeSummaryCallbacks = [];
        for (const writeSummaryCallback of callbacks) {
          writeSummaryCallback();
        }
      });
    });
  } else if (localCache.wroteSummary) {
    const callbacks: (() => void)[] = localCache.writeSummaryCallbacks;
    localCache.writeSummaryCallbacks = [];
    for (const writeSummaryCallback of callbacks) {
      writeSummaryCallback();
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _writeTaskError(e: any): void {
  if (!e || !(e.err && e.err[WROTE_ERROR_KEY])) {
    writeError(e);
    localCache.taskErrors++;
  }
}

function exitProcess(errorCode: number): void {
  if (!localCache.watchMode) {
    process.stdout.write('', () => {
      process.exit(errorCode);
    });
  }
}

function wireUpProcessErrorHandling(shouldWarningsFailBuild: boolean): void {
  if (!wiredUpErrorHandling) {
    wiredUpErrorHandling = true;

    let wroteToStdErr: boolean = false;

    if (shouldWarningsFailBuild) {
      const oldStdErr: Function = process.stderr.write;
      process.stderr.write = function (text: string | Buffer): boolean {
        if (text.toString()) {
          wroteToStdErr = true;
          return oldStdErr.apply(process.stderr, arguments);
        }
        return true;
      };
    }

    process.on('exit', (code: number) => {
      duringFastExit = true;
      // eslint-disable-next-line dot-notation
      if (!global['dontWatchExit']) {
        if (!localCache.wroteSummary) {
          localCache.wroteSummary = true;
          console.log('About to exit with code:', code);
          console.error(
            'Process terminated before summary could be written, possible error in async code not ' +
              'continuing!'
          );
          console.log('Trying to exit with exit code 1');
          exitProcess(1);
        } else {
          if (localCache.exitCode !== 0) {
            console.log(`Exiting with exit code: ${localCache.exitCode}`);
            exitProcess(localCache.exitCode);
          } else if (wroteToStdErr) {
            console.error(`The build failed because a task wrote output to stderr.`);
            console.log(`Exiting with exit code: 1`);
            exitProcess(1);
          }
        }
      }
    });

    process.on('uncaughtException', (err: Error) => {
      console.error(err);

      _writeTaskError(err);
      writeSummary(() => {
        exitProcess(1);

        if (localCache.gulpErrorCallback) {
          localCache.gulpErrorCallback(err);
        }
      });
    });
  }
}

function markErrorAsWritten(err: Error): void {
  try {
    err[WROTE_ERROR_KEY] = true;
  } catch (e) {
    // Do Nothing
  }
}

/**
 * Adds a message to be displayed in the summary after execution is complete.
 * @param value - the message to display
 * @public
 */
export function logSummary(value: string): void {
  localCache.writeSummaryLogs.push(value);
}

/**
 * Log a message to the console
 * @param args - the messages to log to the console
 * @public
 */
export function log(...args: string[]): void {
  const currentTime: Date = new Date();
  const timestamp: string = colors.gray(
    [
      padTimePart(currentTime.getHours()),
      padTimePart(currentTime.getMinutes()),
      padTimePart(currentTime.getSeconds()),
    ].join(':')
  );
  console.log(`[${timestamp}] ${args.join('')}`);
}

function padTimePart(timepart: number): string {
  return timepart >= 10 ? timepart.toString(10) : `0${timepart.toString(10)}`;
}

/**
 * Resets the state of the logging cache
 * @public
 */
export function reset(): void {
  localCache.start = process.hrtime();
  localCache.warnings = [];
  localCache.errors = [];
  localCache.coverageResults = 0;
  localCache.coveragePass = 0;
  localCache.coverageTotal = 0;
  localCache.taskRun = 0;
  localCache.subTasksRun = 0;
  localCache.taskErrors = 0;
  localCache.totalTaskHrTime = undefined;
  localCache.totalTaskSrc = 0;
  localCache.wroteSummary = false;
  localCache.writingSummary = false;
  localCache.writeSummaryCallbacks = [];
  localCache.testsRun = 0;
  localCache.testsPassed = 0;
  localCache.testsFailed = 0;
  localCache.testsFlakyFailed = 0;
  localCache.testsSkipped = 0;
  localCache.writeSummaryLogs = [];
}

/**
 * The result of a functional test run
 * @public
 */
export enum TestResultState {
  Passed,
  Failed,
  FlakyFailed,
  Skipped,
}

/**
 * Store a single functional test run's information
 * @param name - the name of the test
 * @param result - the result of the test
 * @param duration - the length of time it took for the test to execute
 * @public
 */
export function functionalTestRun(name: string, result: TestResultState, duration: number): void {
  localCache.testsRun++;

  switch (result) {
    case TestResultState.Failed:
      localCache.testsFailed++;
      break;
    case TestResultState.Passed:
      localCache.testsPassed++;
      break;
    case TestResultState.FlakyFailed:
      localCache.testsFlakyFailed++;
      break;
    case TestResultState.Skipped:
      localCache.testsSkipped++;
      break;
  }
}

/** @public */
export function endTaskSrc(taskName: string, startHrtime: [number, number], fileCount: number): void {
  localCache.totalTaskSrc++;
  const taskDuration: [number, number] = process.hrtime(startHrtime);
  if (!localCache.totalTaskHrTime) {
    localCache.totalTaskHrTime = taskDuration;
  } else {
    localCache.totalTaskHrTime[0] += taskDuration[0];
    const nanoSecTotal: number = taskDuration[1] + localCache.totalTaskHrTime[1];
    if (nanoSecTotal > 1e9) {
      localCache.totalTaskHrTime[0]++;
      localCache.totalTaskHrTime[1] = nanoSecTotal - 1e9;
    } else {
      localCache.totalTaskHrTime[1] = nanoSecTotal;
    }
  }

  log(taskName, 'read src task duration:', colors.yellow(prettyTime(taskDuration)), `- ${fileCount} files`);
}

/**
 * Store coverage information, potentially logging an error if the coverage is below the threshold
 * @param coverage - the coverage of the file as a percentage
 * @param threshold - the minimum coverage for the file as a percentage, an error will be logged if coverage is below
 *  the threshold
 * @param filePath - the path to the file whose coverage is being measured
 * @public
 */
export function coverageData(coverage: number, threshold: number, filePath: string): void {
  localCache.coverageResults++;

  if (coverage < threshold) {
    error('Coverage:', Math.floor(coverage) + '% (<' + threshold + '%) -', filePath);
  } else {
    localCache.coveragePass++;
  }

  localCache.coverageTotal += coverage;
}

// eslint-disable-next-line no-control-regex
const colorCodeRegex: RegExp = /\x1B[[(?);]{0,2}(;?\d)*./g;

/**
 * Adds a suppression for an error or warning
 * @param suppression - the error or warning as a string or Regular Expression
 * @public
 */
export function addSuppression(suppression: string | RegExp): void {
  if (typeof suppression === 'string') {
    suppression = normalizeMessage(suppression);
  }

  localCache.errorAndWarningSuppressions.push(suppression);

  if (getConfig().verbose) {
    logSummary(`${colors.yellow('Suppressing')} - ${suppression.toString()}`);
  }
}

/**
 * Logs a warning. It will be logged to standard error and cause the build to fail
 * if buildConfig.shouldWarningsFailBuild is true, otherwise it will be logged to standard output.
 * @param message - the warning description
 * @public
 */
export function warn(...args: string[]): void {
  args.splice(0, 0, 'Warning -');

  const stringMessage: string = normalizeMessage(args.join(' '));

  if (!messageIsSuppressed(stringMessage)) {
    localCache.warnings.push(stringMessage);
    log(colors.yellow.apply(undefined, args));
  }
}

/**
 * Logs an error to standard error and causes the build to fail.
 * @param message - the error description
 * @public
 */
export function error(...args: string[]): void {
  args.splice(0, 0, 'Error -');

  const stringMessage: string = normalizeMessage(args.join(' '));

  if (!messageIsSuppressed(stringMessage)) {
    localCache.errors.push(stringMessage);
    log(colors.red.apply(undefined, args));
  }
}

/**
 * Logs a message about a particular file
 * @param write - the function which will write message
 * @param taskName - the name of the task which is doing the logging
 * @param filePath - the path to the file which encountered an issue
 * @param line - the line in the file which had an issue
 * @param column - the column in the file which had an issue
 * @param errorCode - the custom error code representing this error
 * @param message - a description of the error
 * @public
 */
export function fileLog(
  write: (text: string) => void,
  taskName: string,
  filePath: string,
  line: number,
  column: number,
  errorCode: string,
  message: string
): void {
  if (!filePath) {
    filePath = '<undefined path>';
  } else if (path.isAbsolute(filePath)) {
    filePath = path.relative(process.cwd(), filePath);
  }

  write(`${colors.cyan(taskName)} - ${filePath}(${line},${column}): error ${errorCode}: ${message}`);
}

/**
 * Logs a warning regarding a specific file.
 * @param filePath - the path to the file which encountered an issue
 * @param line - the line in the file which had an issue
 * @param column - the column in the file which had an issue
 * @param warningCode - the custom warning code representing this warning
 * @param message - a description of the warning
 * @public
 */
export function fileWarning(
  taskName: string,
  filePath: string,
  line: number,
  column: number,
  errorCode: string,
  message: string
): void {
  fileLog(warn, taskName, filePath, line, column, errorCode, message);
}

/**
 * Logs an error regarding a specific file to standard error and causes the build to fail.
 * @param filePath - the path to the file which encountered an issue
 * @param line - the line in the file which had an issue
 * @param column - the column in the file which had an issue
 * @param errorCode - the custom error code representing this error
 * @param message - a description of the error
 * @public
 */
export function fileError(
  taskName: string,
  filePath: string,
  line: number,
  column: number,
  errorCode: string,
  message: string
): void {
  fileLog(error, taskName, filePath, line, column, errorCode, message);
}

/**
 * Logs a message to standard output if the verbose flag is specified.
 * @param args - the messages to log when in verbose mode
 * @public
 */
export function verbose(...args: string[]): void {
  if (getFlagValue('verbose')) {
    log.apply(undefined, args);
  }
}

/** @public */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function generateGulpError(err: any): any {
  if (isVerbose()) {
    return err;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output: any = {
      showStack: false,
      toString: (): string => {
        return '';
      },
    };

    markErrorAsWritten(output);

    return output;
  }
}

/**
 * Logs an error to standard error and causes the build to fail.
 * @param e - the error (can be a string or Error object)
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function writeError(e: any): void {
  if (e) {
    if (!e[WROTE_ERROR_KEY]) {
      if (e.err) {
        if (!e.err[WROTE_ERROR_KEY]) {
          const msg: string | undefined = formatError(e);
          const time: string = prettyTime(e.hrDuration);

          error(
            "'" + colors.cyan(e.task) + "'",
            colors.red(e.subTask ? 'sub task errored after' : 'errored after'),
            colors.magenta(time),
            '\r\n',
            msg || ''
          );
          markErrorAsWritten(e.err[WROTE_ERROR_KEY]);
        }
      } else if (e.fileName) {
        // This is probably a plugin error
        if (isVerbose()) {
          error(
            e.message,
            '\r\n',
            e.plugin + ": '" + colors.yellow(e.fileName) + "':" + e.lineNumber,
            '\r\n',
            e.stack
          );
        } else {
          error(e.message, '\r\n', e.plugin + ": '" + colors.yellow(e.fileName) + "':" + e.lineNumber);
        }
      } else {
        if (isVerbose()) {
          error('Unknown', '\r\n', colors.red(e.message), '\r\n', e.stack);
        } else {
          error('Unknown', '\r\n', colors.red(e.message));
        }
      }
      markErrorAsWritten(e);
    }
  } else {
    error('Unknown Error Object');
  }
}

/**
 * Returns the list of warnings which have been logged
 * @public
 */
export function getWarnings(): string[] {
  return localCache.warnings;
}

/**
 * Returns the list of errors which have been logged
 * @public
 */
export function getErrors(): string[] {
  return localCache.errors;
}

/** @public */
export function getStart(): [number, number] | undefined {
  return localCache.start;
}

/**
 * @public
 */
export function setWatchMode(): void {
  localCache.watchMode = true;
}

/**
 * @public
 */
export function getWatchMode(): boolean | undefined {
  return localCache.watchMode;
}

/**
 * @public
 */
export function setExitCode(exitCode: number): void {
  localCache.exitCode = exitCode;
}

/**
 * @public
 */
export function logStartSubtask(name: string): void {
  log(`Starting subtask '${colors.cyan(name)}'...`);
  localCache.subTasksRun++;
}

/**
 * @public
 */
export function logEndSubtask(name: string, startTime: [number, number], errorObject?: Error): void {
  const duration: [number, number] = process.hrtime(startTime);

  if (name) {
    if (!errorObject) {
      const durationString: string = prettyTime(duration);
      log(`Finished subtask '${colors.cyan(name)}' after ${colors.magenta(durationString)}`);
    } else {
      writeError({
        err: errorObject,
        task: name,
        subTask: true,
        hrDuration: duration,
      });
    }
  }
}

/**
 * @public
 */
export function initialize(
  gulp: typeof Gulp,
  config: IBuildConfig,
  gulpErrorCallback?: (err: Error) => void,
  gulpStopCallback?: (err: Error) => void
): void {
  // This will add logging to the gulp execution

  localCache.gulp = gulp;

  wireUpProcessErrorHandling(config.shouldWarningsFailBuild);

  localCache.gulpErrorCallback =
    gulpErrorCallback ||
    (() => {
      // Do Nothing
    });

  localCache.gulpStopCallback =
    gulpStopCallback ||
    (() => {
      // Do Nothing
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gulp.on('start', (err: any) => {
    log('Starting gulp');
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gulp.on('stop', (err: any) => {
    writeSummary(() => {
      // error if we have any errors
      if (
        localCache.taskErrors > 0 ||
        (getWarnings().length && config.shouldWarningsFailBuild) ||
        getErrors().length ||
        localCache.testsFailed > 0
      ) {
        exitProcess(1);
      }

      if (localCache.gulpStopCallback) {
        localCache.gulpStopCallback(err);
      }
      exitProcess(0);
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gulp.on('err', (err: any) => {
    _writeTaskError(err);
    writeSummary(() => {
      exitProcess(1);
      if (localCache.gulpErrorCallback) {
        localCache.gulpErrorCallback(err);
      }
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gulp.on('task_start', (e: any) => {
    if (localCache.fromRunGulp) {
      log('Starting', "'" + colors.cyan(e.task) + "'...");
    }

    localCache.taskRun++;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gulp.on('task_stop', (e: any) => {
    const time: string = prettyTime(e.hrDuration);

    if (localCache.fromRunGulp) {
      log('Finished', "'" + colors.cyan(e.task) + "'", 'after', colors.magenta(time));
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gulp.on('task_err', (err: any) => {
    _writeTaskError(err);
    writeSummary(() => {
      exitProcess(1);
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gulp.on('task_not_found', (err: any) => {
    log(colors.red("Task '" + err.task + "' is not in your gulpfile"));
    log('Please check the documentation for proper gulpfile formatting');
    exitProcess(1);
  });
}

/**
 * @public
 */
export function markTaskCreationTime(): void {
  localCache.taskCreationTime = process.hrtime(getStart());
}

function messageIsSuppressed(message: string): boolean {
  for (const suppression of localCache.errorAndWarningSuppressions) {
    if (typeof suppression === 'string' && message === suppression) {
      return true;
    } else if (suppression instanceof RegExp && message.match(suppression)) {
      return true;
    }
  }
  return false;
}

function normalizeMessage(message: string): string {
  return message
    .replace(colorCodeRegex, '') // remove colors
    .replace(/\r\n/g, '\n') // normalize newline
    .replace(/\\/g, '/'); // normalize slashes
}
