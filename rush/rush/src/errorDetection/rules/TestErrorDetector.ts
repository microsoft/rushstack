/**
 * @file TestErrorDetector.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Detects an error that occurs while running tests from ms-core-build
 */

import { IErrorDetectionRule, RegexErrorDetector, ErrorDetectionMode } from '../ErrorDetector';
import TaskError from '../TaskError';

/**
 * TestTaskError extends TaskError
 */
class TestTaskError extends TaskError {
  public toString(mode: ErrorDetectionMode) {
    const errorMessage = `[${this._type}] '${this._message}' failed`;
    return this._appendPrefix(errorMessage, mode);
  }
}

// Example: "       × This Test Failed"
// 0: This Test Failed
// This test should intentionally fail for the following: "       × 23 tests failed" 
export default RegexErrorDetector(
  / *× (\D.*)/,
  (match: RegExpExecArray) => {
    return new TestTaskError(
      undefined,
      undefined,
      undefined,
      'test',
      match[1]
    );
  }
) as IErrorDetectionRule;
