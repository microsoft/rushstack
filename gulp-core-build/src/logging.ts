/* tslint:disable:max-line-length */

import * as gutil from 'gulp-util';
import * as gulp from 'gulp';
import * as path from 'path';
/* tslint:disable:typedef */
const prettyTime = require('pretty-hrtime');
/* tslint:enable:typedef */
import * as state from './State';
import { getFlagValue } from './config';
import { getConfig } from './index';
import * as Chalk from 'chalk';

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
  totalTaskHrTime: [number, number];
  start?: [number, number];
  taskCreationTime?: [number, number];
  totalTaskSrc: number;
  wroteSummary: boolean;
  writingSummary: boolean;
  writeSummaryCallbacks: Array<() => void>;
  watchMode?: boolean;
  fromRunGulp?: boolean;
  exitCode: number;
  writeSummaryLogs: string[];
  gulp: gulp.Gulp;
  gulpErrorCallback: (err: Object) => void;
  gulpStopCallback: (err: Object) => void;
  errorAndWarningSuppressions: { [key: string]: boolean };
  shouldLogWarningsDuringSummary: boolean;
  shouldLogErrorsDuringSummary: boolean;
}

let wiredUpErrorHandling: boolean = false;
let duringFastExit: boolean = false;

/* tslint:disable:no-any */
let globalInstance: any = global as any;
/* tslint:enable:no-any */

const localCache: ILocalCache = globalInstance.__loggingCache = globalInstance.__loggingCache || {
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
  errorAndWarningSuppressions: {},
  gulp: undefined,
  gulpErrorCallback: undefined,
  gulpStopCallback: undefined,
  shouldLogErrorsDuringSummary: false,
  shouldLogWarningsDuringSummary: false
};

if (!localCache.start) {
  localCache.start = process.hrtime();
}

wireUpProcessErrorHandling();

function isVerbose(): boolean {
  return getFlagValue('verbose');
}

/* tslint:disable:no-any */
function formatError(e: any): string {
/* tslint:enable:no-any */
  'use strict';

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
  if (typeof (Error) === 'undefined') {
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
  'use strict';
  if (duringFastExit) {
    callback();
  } else {
    const stream: NodeJS.WritableStream = process[streamName];
    const outputWritten: boolean = stream.write('');
    if (outputWritten) {
      /* tslint:disable:ban-native-functions */
      setTimeout(() => {
        callback();
      }, 250);
      /* tslint:enable:ban-native-functions */
    } else {
      stream.once('drain', () => {
        /* tslint:disable:ban-native-functions */
        setTimeout(() => {
          callback();
        }, 250);
        /* tslint:enable:ban-native-functions */
      });
    }
  }
}

function afterStreamsFlushed(callback: () => void): void {
  'use strict';
  afterStreamFlushed('stdout', () => {
    afterStreamFlushed('stderr', () => {
      callback();
    });
  });
}

function writeSummary(callback: () => void): void {
  'use strict';
  const shouldRelogIssues: boolean = getFlagValue('relogIssues');

  localCache.writeSummaryCallbacks.push(callback);

  if (!localCache.writingSummary) {
    localCache.writingSummary = true;

    // flush the log
    afterStreamsFlushed(() => {
      log(gutil.colors.magenta('==================[ Finished ]=================='));

      if (shouldRelogIssues && getWarnings().length) {
        const warnings: string[] = getWarnings();
        for (let x: number = 0; x < warnings.length; x++) {
          console.error(gutil.colors.yellow(warnings[x]));
        }
      }

      if (shouldRelogIssues && (localCache.taskErrors > 0 || getErrors().length)) {
        let errors: string[] = getErrors();
        for (let x: number = 0; x < errors.length; x++) {
          console.error(gutil.colors.red(errors[x]));
        }
      }

      afterStreamsFlushed(() => {
        for (let writeSummaryString of localCache.writeSummaryLogs) {
          log(writeSummaryString);
        }
        let totalDuration: [number, number] = process.hrtime(getStart());

        log(`Project ${state.builtPackage.name} version:`, gutil.colors.yellow(state.builtPackage.version));
        log('Build tools version:', gutil.colors.yellow(state.coreBuildPackage.version));
        log('Node version:', gutil.colors.yellow(process.version));
        // log('Create tasks duration:', gutil.colors.yellow(prettyTime(localCache.taskCreationTime)));
        // log('Read src tasks duration:', gutil.colors.yellow(prettyTime(localCache.totalTaskHrTime)));
        log('Total duration:', gutil.colors.yellow(prettyTime(totalDuration)));
        // log(`Tasks run: ${gutil.colors.yellow(localCache.taskRun + '')} Subtasks run: ${gutil.colors.yellow(localCache.subTasksRun + '')}`);

        if (localCache.testsRun > 0) {
          log('Tests results -',
            'Passed:', gutil.colors.green(localCache.testsPassed + ''),
            'Failed:', gutil.colors.red(localCache.testsFailed + ''),
            // 'Flakey:', gutil.colors.yellow(localCache.testsFlakyFailed + ''),
            'Skipped:', gutil.colors.yellow(localCache.testsSkipped + ''));
        }

        if (localCache.coverageResults > 0) {
          log(
            'Coverage results -',
            'Passed:', gutil.colors.green(localCache.coveragePass + ''),
            'Failed:', gutil.colors.red((localCache.coverageResults - localCache.coveragePass) + ''),
            'Avg. Cov.:', gutil.colors.yellow(Math.floor(localCache.coverageTotal / localCache.coverageResults) + '%'));
        }

        if (getWarnings().length) {
          log('Task warnings:', gutil.colors.yellow(getWarnings().length.toString()));
        }

        let totalErrors: number = 0;

        if (localCache.taskErrors > 0 || getErrors().length) {
          totalErrors = (localCache.taskErrors + getErrors().length);
          log('Task errors:', gutil.colors.red(totalErrors + ''));
        }

        localCache.wroteSummary = true;
        const callbacks: (() => void)[] = localCache.writeSummaryCallbacks;
        localCache.writeSummaryCallbacks = [];
        for (let writeSummaryCallback of callbacks) {
          writeSummaryCallback();
        }
      });
    });
  } else if (localCache.wroteSummary) {
    const callbacks: (() => void)[] = localCache.writeSummaryCallbacks;
    localCache.writeSummaryCallbacks = [];
    for (let writeSummaryCallback of callbacks) {
      writeSummaryCallback();
    }
  }
}

/* tslint:disable:no-any */
function _writeTaskError(e: any): void {
/* tslint:enable:no-any */
  'use strict';
  if (!e || !(e.err && e.err[WROTE_ERROR_KEY])) {
    writeError(e);
    localCache.taskErrors++;
  }
}

function exitProcess(errorCode: number): void {
  'use strict';

  if (!localCache.watchMode) {
    process.stdout.write('', () => {
      process.exit(errorCode);
    });
  }
}

function wireUpProcessErrorHandling(): void {
  'use strict';
  if (!wiredUpErrorHandling) {
    wiredUpErrorHandling = true;
    process.on('exit', (code: number) => {
      'use strict';
      duringFastExit = true;

      if (!global['dontWatchExit']) { // tslint:disable-line:no-string-literal
        if (!localCache.wroteSummary) {
          localCache.wroteSummary = true;
          console.log('About to exit with code:', code);
          console.error('Process terminated before summary could be written, possible error in async code not continuing!');
          console.log('Trying to exit with exit code 1');
          process.exit(1);
        } else {
          if (localCache.exitCode !== 0) {
            console.log(`Exiting with exit code: ${localCache.exitCode}`);
            process.exit(localCache.exitCode);
          }
        }
      }
    });

    process.on('uncaughtException',
      (err: Error) => {
        'use strict';
        console.error(err);

        _writeTaskError(err);
        writeSummary(() => {
          exitProcess(1);

          if (localCache.gulp) {
            localCache.gulp.stop();
          }

          if (localCache.gulpErrorCallback) {
            localCache.gulpErrorCallback(err);
          }
        });
      });
  }
}

function markErrorAsWritten(error: Error): void {
  try {
    error[WROTE_ERROR_KEY] = true;
  } catch (e) {
    // Do Nothing
  }
}

export function logSummary(value: string): void {
  'use strict';
  localCache.writeSummaryLogs.push(value);
}

export function log(...args: Array<string | Chalk.ChalkChain>): void {
  'use strict';
  gutil.log.apply(this, args);
}

export function reset(): void {
  'use strict';
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

export enum TestResultState {
  Passed,
  Failed,
  FlakyFailed,
  Skipped
}

export function functionalTestRun(name: string, result: TestResultState, duration: number): void {
  'use strict';
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

export function endTaskSrc(taskName: string, startHrtime: [number, number], fileCount: number): void {
  'use strict';
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

  log(taskName, 'read src task duration:', gutil.colors.yellow(prettyTime(taskDuration)), `- ${fileCount} files`);
}

export function coverageData(coverage: number, threshold: number, filePath: string): void {
  'use strict';
  localCache.coverageResults++;

  if (coverage < threshold) {
    error('Coverage:', Math.floor(coverage) + '% (<' + threshold + '%) -', filePath);
  } else {
    localCache.coveragePass++;
  }

  localCache.coverageTotal += coverage;
}

export function addSuppression(str: string): void {
  'use strict';

  str = str
    .replace(colorCodeRegex, '') // remove colors
    .replace(/\r\n/g, '\n'); // normalize newline
  localCache.errorAndWarningSuppressions[str] = true;

  logSummary(`${gutil.colors.yellow('Supressing')} - ${str}`);
}

const colorCodeRegex: RegExp = /\x1B[[(?);]{0,2}(;?\d)*./g;

export function warn(...args: Array<string | Chalk.ChalkChain>): void {
  'use strict';
  args.splice(0, 0, 'Warning -');

  const stringMessage: string = args.join(' ');

  if (!localCache.errorAndWarningSuppressions[stringMessage.replace(colorCodeRegex, '')]) {
    localCache.warnings.push(stringMessage);
    log(gutil.colors.yellow.apply(undefined, args));
  }
}

export function error(...args: Array<string | Chalk.ChalkChain>): void {
  'use strict';
  args.splice(0, 0, 'Error -');

  const stringMessage: string = args.join(' ');

  if (!localCache.errorAndWarningSuppressions[stringMessage.replace(colorCodeRegex, '')]) {
    localCache.errors.push(stringMessage);
    log(gutil.colors.red.apply(undefined, args));
  }
}

export function fileLog(write: (text: string) => void, taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void {
  'use strict';

  if (!filePath) {
    filePath = '<undefined path>';
  } else if (path.isAbsolute(filePath)) {
    filePath = path.relative(process.cwd(), filePath);
  }

  write(`${gutil.colors.cyan(taskName)} - ${filePath}(${line},${column}): error ${errorCode}: ${message}`);
}

export function fileWarning(taskName: string, filePath: string, line: number, column: number, errorCode: string,  message: string): void {
  fileLog(warn, taskName, filePath, line, column, errorCode, message);
}

export function fileError(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void {
  fileLog(error, taskName, filePath, line, column, errorCode, message);
}

export function verbose(...args: Array<string | Chalk.ChalkChain>): void {
  'use strict';

  if (getFlagValue('verbose')) {
    log.apply(undefined, args);
  }
}

export function generateGulpError(error: Object): Object {
  if (isVerbose()) {
    return error;
  } else {
    /* tslint:disable:no-any */
    const output: any = {
    /* tslint:enable:no-any */
      showStack: false,
      toString: (): string => {
        return '';
      }
    };

    markErrorAsWritten(output);

    return output;
  }
}

/* tslint:disable:no-any */
export function writeError(e: any): void {
/* tslint:enable:no-any */
  'use strict';
  if (e) {
    if (!e[WROTE_ERROR_KEY]) {
      if (e.err) {
        if (!e.err[WROTE_ERROR_KEY]) {
          const msg: string = formatError(e);
          const time: string = prettyTime(e.hrDuration);

          error(
            '\'' + gutil.colors.cyan(e.task) + '\'',
            gutil.colors.red(e.subTask ? 'sub task errored after' : 'errored after'),
            gutil.colors.magenta(time),
            '\r\n',
            msg
          );
          markErrorAsWritten(e.err[WROTE_ERROR_KEY]);
        }
      } else if (e.fileName) {
        // This is probably a plugin error
        if (isVerbose()) {
          error(
            e.message,
            '\r\n',
            e.plugin + ': \'' + gutil.colors.yellow(e.fileName) + '\':' + e.lineNumber,
            '\r\n',
            e.stack
          );
        } else {
          error(
            e.message,
            '\r\n',
            e.plugin + ': \'' + gutil.colors.yellow(e.fileName) + '\':' + e.lineNumber
          );
        }
      } else {
        if (isVerbose()) {
          error(
            'Unknown',
            '\r\n',
            gutil.colors.red(e.message),
            '\r\n',
            e.stack);
        } else {
          error(
            'Unknown',
            '\r\n',
            gutil.colors.red(e.message));
        }
      }
      markErrorAsWritten(e);
    }
  } else {
    error('Unknown Error Object');
  }
}

export function getWarnings(): string[] {
  'use strict';
  return localCache.warnings;
}

export function getErrors(): string[] {
  'use strict';
  return localCache.errors;
}

export function getStart(): [number, number] {
  'use strict';
  return localCache.start;
}

export function setWatchMode(): void {
  'use strict';
  localCache.watchMode = true;
}

export function getWatchMode(): boolean {
  'use strict';
  return localCache.watchMode;
}

export function setExitCode(exitCode: number): void {
  'use strict';
  localCache.exitCode = exitCode;
}

export function logStartSubtask(name: string): void {
  log(`Starting subtask '${gutil.colors.cyan(name)}'...`);
  localCache.subTasksRun++;
}

export function logEndSubtask(name: string, startTime: [number, number], errorObject?: Error): void {
const duration: [number, number] = process.hrtime(startTime);

  if (name) {
    if (!errorObject) {
      const durationString: string = prettyTime(duration);
      log(`Finished subtask '${gutil.colors.cyan(name)}' after ${gutil.colors.magenta(durationString)}`);
    } else {
      writeError({
        err: errorObject,
        task: name,
        subTask: true,
        hrDuration: duration
      });
    }
  }
}

export function initialize(gulp: gulp.Gulp, gulpErrorCallback?: (err: Error) => void, gulpStopCallback?: (err: Error) => void): void {
  'use strict';
  // This will add logging to the gulp execution

  localCache.gulp = gulp;

  wireUpProcessErrorHandling();

  localCache.gulpErrorCallback = gulpErrorCallback || (() => {
    'use strict';
    // Do Nothing
  });

  localCache.gulpStopCallback = gulpStopCallback || (() => {
    'use strict';
    // Do Nothing
  });

  gulp.on('start', (err: Object) => {
    'use strict';
    log('Starting gulp');
  });

  gulp.on('stop', (err: Object) => {
    'use strict';
    writeSummary(() => {
      // error if we have any errors
      if (localCache.taskErrors > 0 ||
        (getWarnings().length && getConfig().shouldWarningsFailBuild) ||
        getErrors().length ||
        localCache.testsFailed > 0) {
        exitProcess(1);
      }

      localCache.gulpStopCallback(err);
      exitProcess(0);
    });
  });

  gulp.on('err', (err: Object) => {
    'use strict';
    _writeTaskError(err);
    writeSummary(() => {
      exitProcess(1);
      localCache.gulpErrorCallback(err);
    });
  });

  /* tslint:disable:no-any */
  gulp.on('task_start', (e: any) => {
  /* tslint:enable:no-any */
    'use strict';
    if (localCache.fromRunGulp) {
      log('Starting', '\'' + gutil.colors.cyan(e.task) + '\'...');
    }

    localCache.taskRun++;
  });

  /* tslint:disable:no-any */
  gulp.on('task_stop', (e: any) => {
  /* tslint:enable:no-any */
    'use strict';
    const time: string = prettyTime(e.hrDuration);

    if (localCache.fromRunGulp) {
      log(
        'Finished', '\'' + gutil.colors.cyan(e.task) + '\'',
        'after', gutil.colors.magenta(time)
      );
    }
  });

  /* tslint:disable:no-any */
  gulp.on('task_err', (err: any) => {
  /* tslint:enable:no-any */
    'use strict';
    _writeTaskError(err);
    writeSummary(() => {
      exitProcess(1);
    });
  });

  /* tslint:disable:no-any */
  gulp.on('task_not_found', (err: any) => {
  /* tslint:enable:no-any */
    'use strict';
    log(
      gutil.colors.red('Task \'' + err.task + '\' is not in your gulpfile')
    );
    log('Please check the documentation for proper gulpfile formatting');
    exitProcess(1);
  });
}

export function markTaskCreationTime(): void {
  'use strict';
  localCache.taskCreationTime = process.hrtime(getStart());
}
