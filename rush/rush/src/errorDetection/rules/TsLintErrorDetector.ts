/**
 * @file TsLintErrorDetector.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Detects an error from TypeScript Linter
 */

import * as path from 'path';
import { IErrorDetectionRule, RegexErrorDetector } from '../ErrorDetector';
import TaskError from '../TaskError';

// Example: "[22:50:27] [gulp-tslint] error blah/test.ts[84, 20]: syntax error"
// 0: input
// 1: "[22:50:27]"
// 2: "[gulp-tslint]"
// 3: "error"
// 4: "blah/test.ts"
// 5: "84, 20"
// 6: "syntax error"
export default RegexErrorDetector(
  new RegExp('^(\\[[^\\]]+\\]) *(\\[[^\\]]+\\]) *([^ ]+) *([^[]+) *\\[([^\\]]+)\\]: *(.*)'),
  (match: RegExpExecArray) => {
    const [line, offset] = match[5].split(',');
    return new TaskError(
      path.resolve(process.cwd(), 'src', match[4]),
      Number(line),
      Number(offset),
      'tslint',
      match[6]
    );
  }
) as IErrorDetectionRule;
