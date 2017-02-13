// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as os from 'os';

import TaskError from './errorDetection/TaskError';
import { Interleaver, ITaskWriter } from '@microsoft/stream-collator';
import ErrorDetector, { ErrorDetectionMode } from './errorDetection/ErrorDetector';
import * as ErrorDetectionRules from './errorDetection/rules/index';

console.log('gulp2vs: Running in "' + process.cwd() + '"');

const errorDetector: ErrorDetector = new ErrorDetector([
  ErrorDetectionRules.TsErrorDetector,
  ErrorDetectionRules.TsLintErrorDetector
]);

const writer: ITaskWriter = Interleaver.registerTask('vs gulp');

const gulpBundle: child_process.ChildProcess = child_process.exec('gulp');

gulpBundle.stdout.on('data', (data: string) => {
  writer.write(data);
});

gulpBundle.stderr.on('data', (data: string) => {
  writer.writeError(data);
});

gulpBundle.on('exit', (code: number) => {
  const errors: TaskError[] = errorDetector.execute(writer.getStdOutput());

  for (let i: number = 0; i < errors.length; i++) {
    writer.writeError(errors[i].toString(ErrorDetectionMode.VisualStudio) + os.EOL);
  }

  writer.writeLine('gulp2vs: Done.');
  writer.close();
  if (errors.length) {
    process.exit(1);
  }
});
