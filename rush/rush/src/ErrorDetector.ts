import * as path from 'path';

// Example: "[22:50:27] [gulp-tslint] error blah/test.ts[84, 20]: syntax error"
// 0: input
// 1: "[22:50:27]"
// 2: "[gulp-tslint]"
// 3: "error"
// 4: "blah/test.ts"
// 5: "84, 20"
// 6: "syntax error"
const lintRegex = new RegExp('^(\\[[^\\]]+\\]) *(\\[[^\\]]+\\]) *([^ ]+) *([^[]+) *\\[([^\\]]+)\\]: *(.*)');

// Example: "Error: TypeScript error: src\test.ts(68,6): error TS2304: Cannot find name 'x'."
// 0: input
// 1: "src\test.ts"
// 2: "(68,6):"
// 3: "error TS2304: Cannot find name 'x'."
const tscRegex = new RegExp('^Error: TypeScript error: ([^\\(]+) *([^:]+:) *(.*)');

// Example: "       × This Test Failed"
const testRegex = new RegExp(' *× (\\D.*)');

export enum ErrorDetectionMode {
  LocalBuild = 1,
  VisualStudio = 2,
  VisualStudioOnline = 3
}

function formatError(errorMessage: string, mode: ErrorDetectionMode): string {
  if (mode === ErrorDetectionMode.VisualStudioOnline) {
    return `##vso[task.logissue type=error;]${errorMessage}`;
  }
  return errorMessage;
}

export default function ErrorDetector(stdout: string, mode: ErrorDetectionMode = ErrorDetectionMode.LocalBuild): string[] {
  const errors: string[] = [];
  const lines = stdout.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match = lintRegex.exec(line);
    if (match) {
      const filename = (mode === ErrorDetectionMode.VisualStudioOnline ?
        match[4] :
        path.resolve(process.cwd(), 'src', match[4]));
      errors.push(formatError(`${filename}(${match[5]}): [tslint] ${match[6]}`, mode));
    } else {
      match = tscRegex.exec(line);
      if (match) {
        const filename = (mode === ErrorDetectionMode.VisualStudioOnline ?
          match[1] :
          path.resolve(process.cwd(), 'src', match[1]));
        errors.push(formatError(`${filename}${match[2]} [tsc] ${match[3]}`, mode));
      } else {
        match = testRegex.exec(line);
        if (match) {
          // todo - how will VSO handle this? should we add test filename?
          errors.push(formatError('[test] ' + match[1], mode));
        }
      }
    }
  }

  return errors;
}

