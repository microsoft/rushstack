// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { OperationRunnerLifecycleHooks } from './OperationLifecycle';

/**
 * A plugin tht interacts with a operation runner
 */
export interface IOperationRunnerPlugin {
  /**
   * Applies this plugin.
   */
  apply(hooks: OperationRunnerLifecycleHooks): void;
}
