import * as child_process from 'child_process';
import * as os from 'os';

import TaskError from './errorDetection/TaskError';
import StreamModerator, { DualTaskStream } from '@ms/stream-moderator';
import ErrorDetector, { ErrorDetectionMode } from './errorDetection/ErrorDetector';
import * as ErrorDetectionRules from './errorDetection/rules/index';

console.log('gulp2vs: Running in "' + process.cwd() + '"');

const errorDetector: ErrorDetector = new ErrorDetector([
  ErrorDetectionRules.TsErrorDetector,
  ErrorDetectionRules.TsLintErrorDetector
]);

const moderator: StreamModerator<DualTaskStream> = new StreamModerator<DualTaskStream>();
const dualStream: DualTaskStream = new DualTaskStream(false);

moderator.register(dualStream);

const gulpBundle: child_process.ChildProcess = child_process.exec('gulp bundle');

moderator.pipe(process.stdout);

gulpBundle.stdout.pipe(dualStream.stdout);
gulpBundle.stderr.pipe(dualStream.stderr);

gulpBundle.on('exit', (code: number) => {
  const errors: TaskError[] = errorDetector.execute(dualStream.stderr.readAll());

  for (let i: number = 0; i < errors.length; i++) {
    dualStream.stderr.write(errors[i].toString(ErrorDetectionMode.VisualStudio) + os.EOL);
  }

  dualStream.stdout.write('gulp2vs: Done.');
  dualStream.end();

  if (errors.length) {
    process.exit(1);
  }
});
