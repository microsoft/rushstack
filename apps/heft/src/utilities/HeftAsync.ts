// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';

export class HeftAsync {
  public static runWatcherWithErrorHandling(fn: () => Promise<void>, scopedLogger: ScopedLogger): void {
    try {
      fn().catch((e) => scopedLogger.emitError(e));
    } catch (e) {
      scopedLogger.emitError(e as Error);
    }
  }
}
