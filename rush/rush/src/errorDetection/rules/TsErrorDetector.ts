/**
 * @file TsErrorDetector.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Detects a TypeScript compiler error
 */

import { IErrorDetectionRule, RegexErrorDetector } from '../ErrorDetector';
import { BuildTaskError } from '../TaskError';

// Example: "[20:22:07] Error - typescript - src\Cache.ts(5,8): error TS2322: 'A' is not 'B'"
// 0: input
// 1: "[20:22:07]"
// 2: "src\Cache.ts"
// 3: "5"
// 4: "8"
// 5: "error TS2322: 'A' is not 'B'"
export default RegexErrorDetector(
  /^\s*(\[[^\]]+\])\s*Error\s*-\s*typescript\s*-\s*([^(]+)\(([0-9]+)\s*,\s*([0-9]+)\):\s*(.*)\s*$/,
  (match: RegExpExecArray) => {
    return new BuildTaskError(
      'typescript',     // type
      match[5],         // message
      match[2],         // file
      Number(match[3]), // line
      Number(match[4])  // offset
    );
  }
) as IErrorDetectionRule;
