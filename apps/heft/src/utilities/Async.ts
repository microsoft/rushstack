// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async as CoreAsync } from '@rushstack/node-core-library';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';

export class Async {
  public static async forEachLimitAsync<TEntry>(
    array: TEntry[],
    parallelismLimit: number,
    fn: (entry: TEntry) => Promise<void>
  ): Promise<void> {
    // Defer to the implementation in node-core-library
    return CoreAsync.forEachLimitAsync(array, parallelismLimit, fn);
  }

  public static runWatcherWithErrorHandling(fn: () => Promise<void>, scopedLogger: ScopedLogger): void {
    try {
      fn().catch((e) => scopedLogger.emitError(e));
    } catch (e) {
      scopedLogger.emitError(e);
    }
  }
}
