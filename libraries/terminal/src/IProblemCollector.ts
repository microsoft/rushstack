// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IProblem } from '@rushstack/problem-matcher';

/**
 * Collects problems (errors/warnings/info) encountered during an operation.
 *
 * @beta
 */
export interface IProblemCollector {
  /**
   * Returns the collected problems so far.
   */
  get problems(): ReadonlySet<IProblem>;
}
