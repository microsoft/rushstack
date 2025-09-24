// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IProblem } from './ProblemMatchers';

/**
 * Collects problems (errors/warnings/info) encountered during an operation.
 *
 * @public
 */
export interface IProblemCollector {
  /**
   * Returns the collected problems.
   * @throws Error if the collector is not yet closed.
   */
  getProblems(): ReadonlyArray<IProblem>;
}
