import * as child_process from 'child_process';
import ErrorDetector from './ErrorDetector';

console.log('gulp2vs: Running in "' + process.cwd() + '"');

child_process.exec('gulp', function(err, stdout, stderr) {
  const gulpOutput = stdout.toString();
  console.log(gulpOutput);
  const errors = ErrorDetector(gulpOutput);

  for (let i = 0; i < errors.length; i++) {
    console.log(errors[i]);
  }

  // FOR DEBUGGING:
  // fs.writeFileSync("gulp-errors.log", lines.join('\n'));

  console.log('gulp2vs: Done.');
  if (errors.length) {
    process.exit(1);
  }
});
