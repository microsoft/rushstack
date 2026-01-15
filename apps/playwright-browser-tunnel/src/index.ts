// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Run a Playwright browser server in one environment and drive it from another environment by
 * forwarding Playwright's WebSocket traffic through a tunnel.
 *
 * @remarks
 * This package is intended for remote development and CI scenarios (for example: Codespaces,
 * devcontainers, or a separate "browser host" machine) where you want tests to run in one
 * environment but the actual browser process to run in another.
 *
 * The package provides two main APIs:
 * - {@link PlaywrightTunnel} - Run on the browser host to launch the real browser server and forward messages
 * - {@link tunneledBrowserConnection} - Run on the test runner to create a local endpoint that your Playwright client can connect to
 *
 * @packageDocumentation
 */

export { PlaywrightTunnel } from './PlaywrightBrowserTunnel';
export type { BrowserName, TunnelStatus, IPlaywrightTunnelOptions } from './PlaywrightBrowserTunnel';
export { tunneledBrowser, tunneledBrowserConnection } from './tunneledBrowserConnection';
export type {
  IDisposableTunneledBrowserConnection,
  IDisposableTunneledBrowser
} from './tunneledBrowserConnection';
export { isExtensionInstalledAsync } from './utilities';
