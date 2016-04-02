/// <reference path='../typings/main.d.ts' />

/* tslint:disable:no-string-literal */
/* tslint:disable:max-line-length */
import * as gutil from 'gulp-util';
import * as gulp from 'gulp';
import * as path from 'path';
let prettyTime = require('pretty-hrtime');
import * as state from './State';

const WROTE_ERROR_KEY = '__gulpCoreBuildWroteError';
let verboseMode = state.args['verbose'];

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
  totalTaskHrTime: number[];
  start?: number[];
  taskCreationTime?: number[];
  totalTaskSrc: number;
  wroteSummary: boolean;
  writtingSummary: boolean;
  writeSummaryCallbacks: Array<() => void>;
  watchMode?: boolean;
  fromRunGulp?: boolean;
  exitCode: number;
  writeSummaryLogs: string[];
  gulp: gulp.Gulp;
  gulpErrorCallback: (err: any) => void;
  gulpStopCallback: (err: any) => void;
  errorAndWarningSupressions: { [key: string]: boolean };
}

let wiredUpErrorHandling = false;
let duringFastExit = false;

let globalInstance = global as any;
let localCache: ILocalCache = globalInstance.__loggingCache = globalInstance.__loggingCache || {
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
  totalTaskHrTime: null,
  totalTaskSrc: 0,
  wroteSummary: false,
  writtingSummary: false,
  writeSummaryCallbacks: [],
  exitCode: 0,
  writeSummaryLogs: [],
  errorAndWarningSupressions: {},
  gulp: null,
  gulpErrorCallback: null,
  gulpStopCallback: null
};

if (!localCache.start) {
  localCache.start = process.hrtime();
}

wireUpProcessErrorHandling();

function formatError(e: any) {
  'use strict';

  if (!e.err) {
    if (verboseMode) {
      return e.message + '\r\n' + e.stack;
    } else {
      return e.message;
    }
  }

  // PluginError
  if (typeof e.err.showStack === 'boolean') {
    return e.err.toString() + (e.err.stack && verboseMode ? '\r\n' + e.err.stack : '');
  }

  // normal error
  if (e.err.stack) {
    if (verboseMode) {
      return e.err.stack;
    } else {
      return e.err.message;
    }
  }

  // unknown (string, number, etc.)
  if (typeof (Error) === 'undefined') {
    if (verboseMode) {
      return e.message + '\r\n' + e.stack;
    } else {
      return e.message;
    }
  } else {
    let output = String(e.err);

    try {
      output = JSON.stringify(e.err);
    } catch (e) {
      // Do nothing
    }

    if (verboseMode) {
      return new Error(output)['stack'];
    } else {
      return new Error(output)['message'];
    }
  }
}

function afterStreamFlushed(streamName: string, callback: () => void) {
  'use strict';
  if (duringFastExit) {
    callback();
  } else {
    let stream: NodeJS.WritableStream = process[streamName];
    let outputWritten = stream.write('');
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

function afterStreamsFlushed(callback: () => void) {
  'use strict';
  afterStreamFlushed('stdout', () => {
    afterStreamFlushed('stderr', () => {
      callback();
    });
  });
}

function writeSummary(callback: () => void) {
  'use strict';

  localCache.writeSummaryCallbacks.push(callback);

  if (!localCache.writtingSummary) {
    localCache.writtingSummary = true;

    // flush the log
    afterStreamsFlushed(() => {
      log(gutil.colors.magenta('******Finished******'));

      if (getWarnings().length) {
        let warnings = getWarnings();
        for (let x = 0; x < warnings.length; x++) {
          console.error(gutil.colors.yellow(warnings[x]));
        }
      }

      if (localCache.taskErrors > 0 || getErrors().length) {
        let errors = getErrors();
        for (let x = 0; x < errors.length; x++) {
          console.error(gutil.colors.red(errors[x]));
        }
      }

      afterStreamsFlushed(() => {
        for (let writeSummaryString of localCache.writeSummaryLogs) {
          log(writeSummaryString);
        }
        let totalDuration = process.hrtime(getStart());

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
          log('Task warnings:', gutil.colors.red(getWarnings().length + '\r\n' + getWarnings().join('\r\n')));
        }

        let totalErrors = 0;

        if (localCache.taskErrors > 0 || getErrors().length) {
          totalErrors = (localCache.taskErrors + getErrors().length);
          log('Task errors:', gutil.colors.red(totalErrors + ''));
        }

        localCache.wroteSummary = true;
        let callbacks = localCache.writeSummaryCallbacks;
        localCache.writeSummaryCallbacks = [];
        for (let writeSummaryCallback of callbacks) {
          writeSummaryCallback();
        }
      });
    });
  } else if (localCache.wroteSummary) {
    let callbacks = localCache.writeSummaryCallbacks;
    localCache.writeSummaryCallbacks = [];
    for (let writeSummaryCallback of callbacks) {
      writeSummaryCallback();
    }
  }
}

function _writeTaskError(e: any) {
  'use strict';
  if (!e || !(e.err && e.err[WROTE_ERROR_KEY])) {
    writeError(e);
    localCache.taskErrors++;
  }
}

function exitProcess(errorCode: number) {
  'use strict';

  if (!localCache.watchMode) {
    process.stdout.write('', function() {
      process.exit(errorCode);
    });
  }
}

function wireUpProcessErrorHandling() {
  'use strict';
  if (!wiredUpErrorHandling) {
    wiredUpErrorHandling = true;
    process.on('exit', function(code: number) {
      'use strict';
      duringFastExit = true;

      if (!global.dontWatchExit) {
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
      function(err: any) {
        'use strict';
        if (verboseMode) {
          console.error(err);
        }

        _writeTaskError(err);
        writeSummary(() => {
          exitProcess(1);

          if (localCache.gulp) {
            localCache.gulp['stop']();
          }

          if (localCache.gulpErrorCallback) {
            localCache.gulpErrorCallback(err);
          }
        });
      });
  }
}

function markErrorAsWritten(error: any) {
  try {
    error[WROTE_ERROR_KEY] = true;
  } catch (e) {
    // Do Nothing
  }
}

export function logSummary(value: string) {
  'use strict';
  localCache.writeSummaryLogs.push(value);
}

export function log(...args: Array<string | Chalk.ChalkChain>) {
  'use strict';
  gutil.log.apply(this, args);
}

export function reset() {
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
  localCache.totalTaskHrTime = null;
  localCache.totalTaskSrc = 0;
  localCache.wroteSummary = false;
  localCache.writtingSummary = false;
  localCache.writeSummaryCallbacks = [];
  localCache.testsRun = 0;
  localCache.testsPassed = 0;
  localCache.testsFailed = 0;
  localCache.testsFlakyFailed = 0;
  localCache.testsSkipped = 0;
  localCache.writeSummaryLogs = [];
};

export enum TestResultState {
  Passed,
  Failed,
  FlakyFailed,
  Skipped
}

export function functionalTestRun(name: string, result: TestResultState, duration: number) {
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
};

export function endTaskSrc(taskName: string, startHrtime: number[], fileCount: number) {
  'use strict';
  localCache.totalTaskSrc++;
  let taskDuration = process.hrtime(startHrtime);
  if (!localCache.totalTaskHrTime) {
    localCache.totalTaskHrTime = taskDuration;
  } else {
    localCache.totalTaskHrTime[0] += taskDuration[0];
    let nanoSecTotal = taskDuration[1] + localCache.totalTaskHrTime[1];
    if (nanoSecTotal > 1e9) {
      localCache.totalTaskHrTime[0]++;
      localCache.totalTaskHrTime[1] = nanoSecTotal - 1e9;
    } else {
      localCache.totalTaskHrTime[1] = nanoSecTotal;
    }
  }

  log(taskName, 'read src task duration:', gutil.colors.yellow(prettyTime(taskDuration)), `- ${fileCount} files`);
}

export function coverageData(coverage: number, threshold: number, filePath: string) {
  'use strict';
  localCache.coverageResults++;

  if (coverage < threshold) {
    error('Coverage:', Math.floor(coverage) + '% (<' + threshold + '%) -', filePath);
  } else {
    localCache.coveragePass++;
  }

  localCache.coverageTotal += coverage;
}

export function addSupression(str: string) {
  'use strict';
  localCache.errorAndWarningSupressions[str] = true;
  logSummary(`${gutil.colors.yellow('Supressing')} - ${str}`);
}

export function warn(...args: Array<string | Chalk.ChalkChain>) {
  'use strict';
  args.splice(0, 0, 'Warning -');

  let stringMessage = args.join(' ');

  if (!localCache.errorAndWarningSupressions[stringMessage]) {
    localCache.warnings.push(stringMessage);
    log(gutil.colors.yellow.apply(null, args));
  }
};

export function error(...args: Array<string | Chalk.ChalkChain>) {
  'use strict';
  args.splice(0, 0, 'Error -');

  let stringMessage = args.join(' ');

  if (!localCache.errorAndWarningSupressions[stringMessage]) {
    localCache.errors.push(stringMessage);
    log(gutil.colors.red.apply(null, args));
  }
};

export function fileError(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string) {
  'use strict';

  if (path.isAbsolute(filePath)) {
    filePath = path.relative(process.cwd(), filePath);
  }

  error(`${gutil.colors.cyan(taskName)} - ${filePath}(${line},${column}): error ${errorCode}: ${message}`);
}

export function verbose(...args: Array<string | Chalk.ChalkChain>) {
  'use strict';

  if (state.args.verbose) {
    log.apply(null, args);
  }
};

export function generateGulpError(error: any) {
  if (verboseMode) {
    return error;
  } else {
    let output = {
      showStack: false,
      toString: () => {
        return '';
      }
    };

    markErrorAsWritten(output);

    return output;
  }
};

export function writeError(e: any) {
  'use strict';
  if (e) {
    if (!e[WROTE_ERROR_KEY]) {
      if (e.err) {
        if (!e.err[WROTE_ERROR_KEY]) {
          let msg = formatError(e);
          let time = prettyTime(e.hrDuration);

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
        if (verboseMode) {
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
        if (verboseMode) {
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
};

export function getWarnings() {
  'use strict';
  return localCache.warnings;
};

export function getErrors() {
  'use strict';
  return localCache.errors;
};

export function getStart() {
  'use strict';
  return localCache.start;
};

export function setWatchMode() {
  'use strict';
  localCache.watchMode = true;
};

export function getWatchMode() {
  'use strict';
  return localCache.watchMode;
};

export function setExitCode(exitCode: number) {
  'use strict';
  localCache.exitCode = exitCode;
};

export function logStartSubtask(name: string) {
  log(`Starting subtask '${gutil.colors.cyan(name)}'...`);
  localCache.subTasksRun++;
}

export function logEndSubtask(name: string, startTime: number[], errorObject?: any) {
  let duration = process.hrtime(startTime);

  if (name) {
    if (!errorObject) {
      let durationString = prettyTime(duration);
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

export function initialize(gulp: gulp.Gulp, gulpErrorCallback?: (err: any) => void, gulpStopCallback?: (err: any) => void) {
  'use strict';
  // This will add logging to the gulp execution

  localCache.gulp = gulp;

  wireUpProcessErrorHandling();

  localCache.gulpErrorCallback = gulpErrorCallback || function() {
    'use strict';
    // Do Nothing
  };

  localCache.gulpStopCallback = gulpStopCallback || function() {
    'use strict';
    // Do Nothing
  };

  gulp['on']('start', function(err: any) {
    'use strict';
    log('Starting Gulp');
  });

  gulp['on']('stop', function(err: any) {
    'use strict';
    writeSummary(() => {
      // error if we have any errors or warnings
      if (localCache.taskErrors > 0 ||
        getErrors().length ||
        getWarnings().length ||
        localCache.testsFailed > 0) {
        exitProcess(1);
      }

      localCache.gulpStopCallback(err);
      exitProcess(0);
    });
  });

  gulp['on']('err', function(err: any) {
    'use strict';
    _writeTaskError(err);
    writeSummary(() => {
      exitProcess(1);
      localCache.gulpErrorCallback(err);
    });
  });

  gulp['on']('task_start', function(e: any) {
    'use strict';
    if (localCache.fromRunGulp) {
      log('Starting', '\'' + gutil.colors.cyan(e.task) + '\'...');
    }

    localCache.taskRun++;
  });

  gulp['on']('task_stop', function(e: any) {
    'use strict';
    let time = prettyTime(e.hrDuration);

    if (localCache.fromRunGulp) {
      log(
        'Finished', '\'' + gutil.colors.cyan(e.task) + '\'',
        'after', gutil.colors.magenta(time)
      );
    }
  });

  gulp['on']('task_err', function(err: any) {
    'use strict';
    _writeTaskError(err);
    writeSummary(() => {
      exitProcess(1);
    });
  });

  gulp['on']('task_not_found', function(err: any) {
    'use strict';
    log(
      gutil.colors.red('Task \'' + err.task + '\' is not in your gulpfile')
    );
    log('Please check the documentation for proper gulpfile formatting');
    exitProcess(1);
  });
};

export function markTaskCreationTime() {
  'use strict';
  localCache.taskCreationTime = process.hrtime(getStart());
};
