// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Browser, LaunchOptions } from 'playwright-core';
import playwright from 'playwright-core';

import type { ITerminal } from '@rushstack/terminal';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';

import type { BrowserName } from '../PlaywrightBrowserTunnel.ts';
import { DEFAULT_LISTEN_PORT } from './constants.ts';
import type { IDisposableTunneledBrowser } from './ITunneledBrowser.ts';
import type { IDisposableTunneledBrowserConnection } from './ITunneledBrowserConnection.ts';
import { tunneledBrowserConnection } from './TunneledBrowserConnection.ts';

/**
 * Creates a Playwright Browser instance connected via a tunneled WebSocket connection.
 * @beta
 */
export async function createTunneledBrowserAsync(
  browserName: BrowserName,
  launchOptions: LaunchOptions,
  logger?: ITerminal,
  port: number = DEFAULT_LISTEN_PORT
): Promise<IDisposableTunneledBrowser> {
  // Establish the tunnel first (remoteEndpoint here refers to local proxy endpoint for connect())

  if (!logger) {
    const terminalProvider: ConsoleTerminalProvider = new ConsoleTerminalProvider();
    logger = new Terminal(terminalProvider);
  }

  const connection: IDisposableTunneledBrowserConnection = await tunneledBrowserConnection(logger, port);
  const { remoteEndpoint } = connection;
  // Append query params for browser and launchOptions
  const urlObj: URL = new URL(remoteEndpoint);
  urlObj.searchParams.set('browser', browserName);
  urlObj.searchParams.set('launchOptions', JSON.stringify(launchOptions || {}));
  const connectEndpoint: string = urlObj.toString();
  const browser: Browser = await playwright[browserName].connect(connectEndpoint);
  logger.writeLine(`Connected to remote browser at ${connectEndpoint}`);

  return {
    browser,
    async [Symbol.asyncDispose]() {
      logger.writeLine('Disposing browser');
      await browser.close();
      // Dispose the tunnel connection after browser is closed
      connection[Symbol.dispose]();
    }
  };
}
