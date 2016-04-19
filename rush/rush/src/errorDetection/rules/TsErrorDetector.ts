/**
 * @file TsErrorDetector.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Detects a TypeScript compiler error
 */

import { IErrorDetectionRule, RegexErrorDetector } from '../ErrorDetector';
import { BuildTaskError } from '../TaskError';

// Example: "[gulp-typescript] src\test.ts(68,6): error TS1005 ';' expected."
// 0: input
// 1: "src\test.ts"
// 2: "68"
// 3: "6"
// 4: "error TS2304: Cannot find name 'x'."
export default RegexErrorDetector(
  /\[gulp\-typescript] (.*)\((.*),(.*)\): error (.*)/,
  (match: RegExpExecArray) => {
    return new BuildTaskError(
      'tsc',
      match[4],
      match[1],
      Number(match[2]),
      Number(match[3])
    );
  }
) as IErrorDetectionRule;
