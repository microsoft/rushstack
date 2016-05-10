/**
 * @file TsLintErrorDetector.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Detects an error from TypeScript Linter
 */

import { IErrorDetectionRule, RegexErrorDetector } from '../ErrorDetector';
import { BuildTaskError } from '../TaskError';

// Example: "[20:22:07] Error - tslint - src\Cache.ts(5,8): error no-any: 'any' is not allowed"
// 0: input
// 1: "[20:22:07]"
// 2: "src\Cache.ts"
// 3: "5"
// 4: "8"
// 5: "error no-any: 'any' is not allowed"
export default RegexErrorDetector(
  /^\s*(\[[^\]]+\])\s*Error\s*-\s*tslint\s*-\s*([^(]+)\(([0-9]+)\s*,\s*([0-9]+)\):\s*(.*)\s*$/,
  (match: RegExpExecArray) => {
    return new BuildTaskError(
      'tslint',         // type
      match[5],         // message
      match[2],         // file
      Number(match[3]), // line
      Number(match[4])  // offset
    );
  }
) as IErrorDetectionRule;
