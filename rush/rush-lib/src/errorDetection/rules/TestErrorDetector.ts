/**
 * @file TestErrorDetector.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Detects an error that occurs while running tests from sp-build-internal-web
 */

// tslint:disable:export-name

import { IErrorDetectionRule, RegexErrorDetector } from '../ErrorDetector';
import TaskError from '../TaskError';

// Example: "       × This Test Failed"
// 0: This Test Failed
// This test should intentionally fail for the following: "       × 23 tests failed"
const testErrorDetector: IErrorDetectionRule = RegexErrorDetector(
  / *× (\D.*)/,
  (match: RegExpExecArray) => {
    return new TaskError(
      'test',
      match[1]
    );
  }
) as IErrorDetectionRule;

export default testErrorDetector;
