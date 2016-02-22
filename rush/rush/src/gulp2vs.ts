import * as child_process from 'child_process';
import * as path from 'path';

console.log('gulp2vs: Running in "' + process.cwd() + '"');

// Example: "[22:50:27] [gulp-tslint] error blah/test.ts[84, 20]: syntax error"
// 0: input
// 1: "[22:50:27]"
// 2: "[gulp-tslint]"
// 3: "error"
// 4: "blah/test.ts"
// 5: "84, 20"
// 6: "syntax error"
let lintRegex = new RegExp('^(\\[[^\\]]+\\]) *(\\[[^\\]]+\\]) *([^ ]+) *([^[]+) *\\[([^\\]]+)\\]: *(.*)$');

// Example: "Error: TypeScript error: src\test.ts(68,6): error TS2304: Cannot find name 'x'."
// 0: input
// 1: "src\test.ts"
// 2: "(68,6):"
// 3: "error TS2304: Cannot find name 'x'."
let tscRegex = new RegExp('^Error: TypeScript error: ([^\\(]+) *([^:]+:) *(.*)$');

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
