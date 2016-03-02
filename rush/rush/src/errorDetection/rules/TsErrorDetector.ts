/**
 * @file TsErrorDetector.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Detects a TypeScript compiler error
 */

import * as path from 'path';
import { IErrorDetectionRule, RegexErrorDetector } from '../ErrorDetector';
import TaskError from '../TaskError';

// Example: "Error: TypeScript error: src\test.ts(68,6): error TS2304: Cannot find name 'x'."
// 0: input
// 1: "src\test.ts"
// 2: "(68,6):"
// 3: "error TS2304: Cannot find name 'x'."
export default RegexErrorDetector(
  new RegExp('^Error: TypeScript error: ([^\\(]+) *([^:]+:) *(.*)'),
  (match: RegExpExecArray) => {
    const [line, offset] = match[2].replace(')', '').replace('(', '').split(',');

    return new TaskError(
      path.resolve(process.cwd(), 'src', match[1]),
      Number(line),
      Number(offset),
      'tsc',
      match[3]
    );
  }
) as IErrorDetectionRule;
