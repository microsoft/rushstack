/**
 * @file TsLintErrorDetector.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Detects an error from TypeScript Linter
 */

import { IErrorDetectionRule, RegexErrorDetector } from '../ErrorDetector';
import { BuildTaskError } from '../TaskError';

// Example: "[22:50:27] [gulp-tslint] error blah/test.ts[84, 20]: syntax error"
// 0: input
// 1: "[22:50:27]"
// 2: "[gulp-tslint]"
// 3: "(no-consecutive-blank-lines)"
// 4: "c:/src/blah/test.ts"
// 5: "84, 20"
// 6: "consecutive blank lines are disallowed"
export default RegexErrorDetector(
  /(\[[^\]]+\]) *(\[[^\]]+\]) error *(\([^ ]+\)) *([^[]+) *\[([^\]]+)\]: *(.*)/,
  (match: RegExpExecArray) => {
    const [line, offset] = match[5].split(',');
    return new BuildTaskError(
      'tslint',
      `${match[3]} ${match[6]}`,
      match[4],
      Number(line),
      Number(offset)
    );
  }
) as IErrorDetectionRule;
