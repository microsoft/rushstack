import * as child_process from 'child_process';
import * as os from 'os';

import TaskError from './errorDetection/TaskError';
import Interleaver, { ITaskWriter } from '@ms/interleaver';
import ErrorDetector, { ErrorDetectionMode } from './errorDetection/ErrorDetector';
import * as ErrorDetectionRules from './errorDetection/rules/index';

console.log('gulp2vs: Running in "' + process.cwd() + '"');

const errorDetector: ErrorDetector = new ErrorDetector([
  ErrorDetectionRules.TsErrorDetector,
  ErrorDetectionRules.TsLintErrorDetector
]);

const writer: ITaskWriter = Interleaver.registerTask('vs gulp bundle');

const gulpBundle: child_process.ChildProcess = child_process.exec('gulp bundle');

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
