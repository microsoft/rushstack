import * as child_process from 'child_process';
import * as path from 'path';
import { lintRegex, tscRegex } from './ErrorDetector';

console.log('gulp2vs: Running in "' + process.cwd() + '"');

child_process.exec('gulp', function (err, stdout, stderr) {
  let lines = stdout.toString().split('\n');

  let failed = false;

  for (let i = 0; i < lines.length; ++i) {
    let match = lintRegex.exec(lines[i]);
    if (match) {
      let filename = path.resolve(process.cwd(), 'src', match[4]);

      // "D:\Git\src\blah\test.ts(82, 24): [tslint] syntax error"
      lines[i] = filename + '(' + match[5] + '): [tslint] ' + match[6];
      failed = true;
    } else {
      match = tscRegex.exec(lines[i]);
      if (match) {
        let filename = path.resolve(process.cwd(), match[1]);
        // "D:\Git\src\blah\test.ts(82, 24): [tsc] syntax error"
        lines[i] = filename + match[2] + ' [tsc] ' + match[3];
        failed = true;
      }
    }

    console.log(lines[i]);
  }

  // FOR DEBUGGING:
  // fs.writeFileSync("gulp-errors.log", lines.join('\n'));

  console.log('gulp2vs: Done.');
  if (failed) {
    process.exit(1);
  }
});
