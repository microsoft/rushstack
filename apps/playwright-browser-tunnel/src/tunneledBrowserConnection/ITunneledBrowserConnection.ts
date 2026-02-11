// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LaunchOptions } from 'playwright-core';

import type { BrowserName } from '../PlaywrightBrowserTunnel';

export interface IHandshake {
  action: 'handshake';
  browserName: BrowserName;
  launchOptions: LaunchOptions;
  playwrightVersion: string;
}

export interface IHandshakeAck {
  action: 'handshakeAck';
}

/**
 * Disposable handle returned by {@link tunneledBrowserConnection}.
 * @beta
 */
export interface IDisposableTunneledBrowserConnection {
  /**
   * The WebSocket endpoint URL that the local Playwright client should connect to.
   */
  remoteEndpoint: string;
  /**
   * Dispose method that closes the WebSocket servers.
   * Called automatically when using `using` syntax.
   */
  [Symbol.dispose]: () => void;
  /**
   * Promise that resolves when the remote WebSocket server closes.
   */
  closePromise: Promise<void>;
}
