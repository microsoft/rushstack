import * as child_process from 'child_process';
import ErrorDetector, { ErrorDetectionMode } from './errorDetection/ErrorDetector';
import * as ErrorDetectionRules from './errorDetection/rules/index';

console.log('gulp2vs: Running in "' + process.cwd() + '"');

const errorDetector = new ErrorDetector([
  ErrorDetectionRules.TsErrorDetector,
  ErrorDetectionRules.TsLintErrorDetector
]);

child_process.exec('gulp bundle', function(err, stdout, stderr) {
  const gulpOutput = stdout.toString();
  console.log(gulpOutput);
  const errors = errorDetector.execute(gulpOutput);

  for (let i = 0; i < errors.length; i++) {
    console.log(errors[i].toString(ErrorDetectionMode.VisualStudio));
  }

  // FOR DEBUGGING:
  // fs.writeFileSync("gulp-errors.log", lines.join('\n'));

  console.log('gulp2vs: Done.');
  if (errors.length) {
    process.exit(1);
  }
});
