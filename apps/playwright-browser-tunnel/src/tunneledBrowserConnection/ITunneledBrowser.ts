// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Browser } from 'playwright-core';

/**
 * Disposable handle returned by {@link createTunneledBrowserAsync}.
 * @beta
 */
export interface IDisposableTunneledBrowser {
  /**
   * The connected Playwright Browser instance.
   */
  browser: Browser;
  /**
   * Async dispose method that closes the browser connection.
   * Called automatically when using `await using` syntax.
   */
  [Symbol.asyncDispose]: () => Promise<void>;
}
