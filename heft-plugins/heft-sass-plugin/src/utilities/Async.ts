// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IScopedLogger } from '@rushstack/heft';

export class Async {
  public static runWatcherWithErrorHandling(fn: () => Promise<void>, scopedLogger: IScopedLogger): void {
    try {
      fn().catch((e) => scopedLogger.emitError(e));
    } catch (e) {
      scopedLogger.emitError(e as Error);
    }
  }
}
