// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';

import type { BrowserServer, BrowserType, LaunchOptions } from 'playwright-core';
import { type RawData, WebSocket, type WebSocketServer } from 'ws';
import semver from 'semver';

import { TerminalProviderSeverity, TerminalStreamWritable, type ITerminal } from '@rushstack/terminal';
import { Executable, FileSystem } from '@rushstack/node-core-library';

import { getNormalizedErrorString } from './utilities';
import { LaunchOptionsValidator, type ILaunchOptionsValidationResult } from './LaunchOptionsValidator';

/**
 * Allowed Playwright browser names.
 * @beta
 */
export type BrowserName = 'chromium' | 'firefox' | 'webkit';
const validBrowserNames: Set<string> = new Set(['chromium', 'firefox', 'webkit']);
function isValidBrowserName(browserName: string): browserName is BrowserName {
  return validBrowserNames.has(browserName);
}

/**
 * Status values reported by {@link PlaywrightTunnel}.
 * @beta
 */
export type TunnelStatus =
  | 'waiting-for-connection'
  | 'browser-server-running'
  | 'stopped'
  | 'setting-up-browser-server'
  | 'error';

/**
 * Handshake data exchanged during the initial WebSocket connection.
 * @beta
 */
export interface IHandshake {
  action: 'handshake';
  browserName: BrowserName;
  launchOptions: LaunchOptions;
  playwrightVersion: semver.SemVer;
}

type TunnelMode = 'poll-connection' | 'wait-for-incoming-connection';

/**
 * Options for configuring a {@link PlaywrightTunnel} instance.
 * @beta
 */
export type IPlaywrightTunnelOptions = {
  terminal: ITerminal;
  onStatusChange: (status: TunnelStatus) => void;
  playwrightInstallPath: string;
  /**
   * Optional callback invoked before launching the browser server.
   * Receives the handshake data including launch options.
   * If the callback returns false, the browser server launch will be aborted.
   * This allows the client to prompt the user for approval before starting.
   */
  onBeforeLaunch?: (handshake: IHandshake) => Promise<boolean> | boolean;
} & (
  | {
      mode: 'poll-connection';
      wsEndpoint: string;
    }
  | {
      mode: 'wait-for-incoming-connection';
      listenPort: number;
    }
);

interface IBrowserServerProxy {
  browserServer: BrowserServer;
  client: WebSocket;
}

type ISupportedBrowsers = 'chromium' | 'firefox' | 'webkit';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hosts a Playwright browser server and forwards traffic over a WebSocket tunnel.
 * @beta
 */
export class PlaywrightTunnel {
  private readonly _terminal: ITerminal;
  private readonly _onStatusChange: (status: TunnelStatus) => void;
  private readonly _onBeforeLaunch?: (handshake: IHandshake) => Promise<boolean> | boolean;
  private readonly _playwrightBrowsersInstalled: Set<string> = new Set();
  private _status: TunnelStatus = 'stopped';
  private _initWsPromise?: Promise<WebSocket>;
  private _keepRunning: boolean = false;
  private _ws?: WebSocket;
  private _mode: TunnelMode;
  private readonly _wsEndpoint?: string;
  private readonly _listenPort?: number;
  private readonly _playwrightInstallPath: string;

  public constructor(options: IPlaywrightTunnelOptions) {
    const { mode, terminal, onStatusChange, playwrightInstallPath: tmpPath, onBeforeLaunch } = options;

    if (mode === 'poll-connection') {
      if (!options.wsEndpoint) {
        throw new Error('wsEndpoint is required for poll-connection mode');
      }
      this._wsEndpoint = options.wsEndpoint;
    } else if (mode === 'wait-for-incoming-connection') {
      if (options.listenPort === undefined) {
        throw new Error('listenPort is required for wait-for-incoming-connection mode');
      }
      this._listenPort = options.listenPort;
    } else {
      throw new Error(`Invalid mode: ${mode}`);
    }

    this._mode = mode;
    this._terminal = terminal;
    this._onStatusChange = onStatusChange;
    this._onBeforeLaunch = onBeforeLaunch;
    this._playwrightInstallPath = tmpPath;
  }

  public get status(): TunnelStatus {
    return this._status;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private set status(newStatus: TunnelStatus) {
    this._status = newStatus;
    this._onStatusChange(newStatus);
  }

  public async waitForCloseAsync(): Promise<void> {
    const terminal: ITerminal = this._terminal;
    const initWsPromise: Promise<WebSocket> | undefined = this._initWsPromise;
    if (initWsPromise) {
      const ws: WebSocket = await initWsPromise;
      await once(ws, 'close');
      terminal.writeLine('WebSocket connection closed. resolving init promise.');
      this._initWsPromise = undefined;
    }
  }

  public async startAsync(options: { keepRunning?: boolean } = {}): Promise<void> {
    this._keepRunning = options.keepRunning ?? true;
    const terminal: ITerminal = this._terminal;
    terminal.writeLine(`keepRunning: ${this._keepRunning}`);
    while (this._keepRunning) {
      if (!this._initWsPromise) {
        this._initWsPromise = this._initPlaywrightBrowserTunnelAsync();
      } else {
        terminal.writeLine(`Tunnel is already running with status: ${this.status}`);
      }
      await this.waitForCloseAsync();
    }
  }

  public async stopAsync(): Promise<void> {
    this._keepRunning = false;
    void this._initWsPromise?.finally(() => {
      this._ws?.close();
    });
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this._terminal.writeLine('Disposing WebSocket connection.');
    await this.stopAsync();
  }

  public async cleanTempFilesAsync(): Promise<void> {
    const tmpPath: string = this._playwrightInstallPath;
    this._terminal.writeLine(`Cleaning up temporary files in ${tmpPath}`);
    try {
      await FileSystem.ensureEmptyFolderAsync(tmpPath);
      this._terminal.writeLine(`Temporary files cleaned up.`);
    } catch (error) {
      this._terminal.writeLine(`Failed to clean up temporary files: ${getNormalizedErrorString(error)}`);
    }
  }

  // TODO: We should implement an uninstall command to remove installed Playwright browsers
  // public async uninstallPlaywrightBrowsersAsync(): Promise<void> {}

  private async _runCommandAsync(command: string, args: string[]): Promise<void> {
    const tmpPath: string = this._playwrightInstallPath;
    await FileSystem.ensureFolderAsync(tmpPath);
    this._terminal.writeLine(`Running command: ${command} ${args.join(' ')} in ${tmpPath}`);

    const cp: ChildProcess = Executable.spawn(command, args, {
      stdio: [
        'ignore', // stdin
        'pipe', // stdout
        'pipe' // stderr
      ],
      currentWorkingDirectory: tmpPath
    });

    cp.stdout?.pipe(
      new TerminalStreamWritable({
        terminal: this._terminal,
        severity: TerminalProviderSeverity.log
      })
    );
    cp.stderr?.pipe(
      new TerminalStreamWritable({
        terminal: this._terminal,
        severity: TerminalProviderSeverity.error
      })
    );

    await Executable.waitForExitAsync(cp, { throwOnNonZeroExitCode: true, throwOnSignal: true });
  }

  private async _installPlaywrightCoreAsync({
    playwrightVersion
  }: Pick<IHandshake, 'playwrightVersion'>): Promise<void> {
    this._terminal.writeLine(`Installing playwright-core version ${playwrightVersion}`);
    await this._runCommandAsync('npm', [
      'install',
      `playwright-core-${playwrightVersion}@npm:playwright-core@${playwrightVersion}`
    ]);
  }

  private async _installPlaywrightBrowsersAsync({
    playwrightVersion,
    browserName
  }: Pick<IHandshake, 'playwrightVersion' | 'browserName'>): Promise<void> {
    await this._installPlaywrightCoreAsync({ playwrightVersion });
    this._terminal.writeLine(`Executing playwright-core version ${playwrightVersion}`);
    await this._runCommandAsync('node', [
      `node_modules/playwright-core-${playwrightVersion}/cli.js`,
      'install',
      browserName
    ]);
  }

  private async _tryConnectAsync(): Promise<WebSocket> {
    const wsEndpoint: string | undefined = this._wsEndpoint;
    if (!wsEndpoint) {
      return Promise.reject(new Error('WebSocket endpoint is not defined'));
    }
    return await new Promise<WebSocket>((resolve, reject) => {
      const ws: WebSocket = new WebSocket(wsEndpoint);
      ws.on('open', () => {
        this._terminal.writeLine(`WebSocket connection opened`);
        resolve(ws);
      });
      ws.once('error', (error) => {
        reject(error);
      });
    });
  }

  // TODO: Only supporting one test at a time.
  // Need to support multiple simultaneous connections for parallel tests.
  private async _pollConnectionAsync(): Promise<WebSocket> {
    this._terminal.writeLine(`Waiting for WebSocket connection`);
    return new Promise((resolve, reject) => {
      const interval: NodeJS.Timeout = setInterval(async () => {
        try {
          const ws: WebSocket = await this._tryConnectAsync();
          clearInterval(interval);
          ws.removeAllListeners();
          resolve(ws);
        } catch {
          // no-op
        }
      }, 500);
    });
  }

  private async _waitForIncomingConnectionAsync(): Promise<WebSocket> {
    this._terminal.writeLine('Waiting for incoming WebSocket connection');

    return new Promise<WebSocket>((resolve, reject) => {
      const server: WebSocketServer = new WebSocket.Server({ port: this._listenPort });

      const cleanup = (): void => {
        server.removeAllListeners();
      };

      server.once('connection', (ws) => {
        this._terminal.writeLine('Incoming WebSocket connection established');

        // Stop listening immediately so the port is released
        cleanup();
        server.close((closeError?: Error) => {
          if (closeError) {
            this._terminal.writeLine(
              `Failed to close WebSocket server: ${
                closeError instanceof Error ? closeError.message : closeError
              }`
            );
          }
          resolve(ws);
        });
      });

      server.once('error', (error) => {
        this._terminal.writeLine(`WebSocket server error: ${getNormalizedErrorString(error)}`);

        cleanup();
        // Try to close (best-effort), then reject
        server.close(() => reject(error));
      });
    });
  }

  // TODO: If a user runs this for the first time, `this._playwrightBrowsersInstalled` will be empty
  // and it will try to install the browsers every time. We should persist this information. Maybe a cache file with text per
  // machine instance?
  private async _setupPlaywrightAsync({
    playwrightVersion,
    browserName
  }: Pick<IHandshake, 'playwrightVersion' | 'browserName'>): Promise<typeof import('playwright-core')> {
    const browserKey: string = `${playwrightVersion}-${browserName}`;
    this._terminal.writeLine(`Checking for installed playwright browsers. Installed browsers: ${browserKey}`);
    if (!this._playwrightBrowsersInstalled.has(browserKey)) {
      this._terminal.writeLine(
        `Playwright browser not found. Installing playwright-core version ${playwrightVersion}`
      );
      await this._installPlaywrightBrowsersAsync({ playwrightVersion, browserName });
      this._playwrightBrowsersInstalled.add(browserKey);
    }

    this._terminal.writeLine(`Using playwright-core version ${playwrightVersion} for browser server`);
    return require(`${this._playwrightInstallPath}/node_modules/playwright-core-${playwrightVersion}`);
  }

  private async _getPlaywrightBrowserServerProxyAsync({
    browserName,
    playwrightVersion,
    launchOptions
  }: Pick<IHandshake, 'playwrightVersion' | 'browserName' | 'launchOptions'>): Promise<IBrowserServerProxy> {
    const terminal: ITerminal = this._terminal;

    // Validate launch options against security allowlist
    terminal.writeLine('Validating launch options against security allowlist...');
    const validationResult: ILaunchOptionsValidationResult =
      await LaunchOptionsValidator.validateLaunchOptionsAsync(launchOptions, terminal);

    if (!validationResult.isValid) {
      terminal.writeWarningLine(
        `Some launch options were denied: ${validationResult.deniedOptions.join(', ')}`
      );
      terminal.writeWarningLine(`Using filtered launch options. Denied options have been removed.`);
    }

    // Use filtered options and ensure headless: false for headed tests in codespaces
    // This is critical for the extension's purpose - enabling headed Playwright tests remotely
    const safeOptions: LaunchOptions = {
      ...validationResult.filteredOptions,
      headless: false
    };

    // Log the validated options, excluding 'headless' since it's always false for this extension
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { headless, ...logOptions } = safeOptions;
    terminal.writeLine(
      `Launch options after validation: ${JSON.stringify(logOptions)} (headless: false enforced)`
    );

    const playwright: typeof import('playwright-core') = await this._setupPlaywrightAsync({
      playwrightVersion,
      browserName
    });

    const { chromium, firefox, webkit } = playwright;
    const browsers: Record<ISupportedBrowsers, BrowserType> = { chromium, firefox, webkit };

    const browserServer: BrowserServer = await browsers[browserName].launchServer(safeOptions);

    if (!browserServer) {
      throw new Error(
        `Failed to launch browser server for ${browserName} with options: ${JSON.stringify(safeOptions)}`
      );
    }

    terminal.writeLine(`Launched ${browserName} browser server`);
    const client: WebSocket = new WebSocket(browserServer.wsEndpoint());

    return {
      browserServer,
      client
    };
  }

  private _validateHandshake(rawHandshake: unknown): IHandshake {
    if (
      typeof rawHandshake !== 'object' ||
      rawHandshake === null ||
      'action' in rawHandshake === false ||
      'browserName' in rawHandshake === false ||
      'playwrightVersion' in rawHandshake === false ||
      'launchOptions' in rawHandshake === false ||
      typeof rawHandshake.action !== 'string' ||
      typeof rawHandshake.browserName !== 'string' ||
      typeof rawHandshake.playwrightVersion !== 'string' ||
      typeof rawHandshake.launchOptions !== 'object'
    ) {
      throw new Error(`Invalid handshake: ${JSON.stringify(rawHandshake)}. Must be an object.`);
    }

    const { action, browserName, playwrightVersion, launchOptions } = rawHandshake;

    if (action !== 'handshake') {
      throw new Error(`Invalid action: ${action}. Expected 'handshake'.`);
    }
    const playwrightVersionSemver: semver.SemVer | null = semver.coerce(playwrightVersion);
    if (!playwrightVersionSemver) {
      throw new Error(`Invalid Playwright version: ${playwrightVersion}. Must be a valid semver version.`);
    }
    if (!isValidBrowserName(browserName)) {
      throw new Error(
        `Invalid browser name: ${browserName}. Must be one of ${Array.from(validBrowserNames).join(', ')}.`
      );
    }

    return {
      action,
      launchOptions: launchOptions as LaunchOptions,
      playwrightVersion: playwrightVersionSemver,
      browserName
    };
  }

  // ws1 is the tunnel websocket, ws2 is the browser server websocket
  private async _setupForwardingAsync(ws1: WebSocket, ws2: WebSocket): Promise<void> {
    this._terminal.writeLine('Setting up message forwarding between ws1 and ws2');
    ws1.on('message', (data) => {
      if (ws2.readyState === WebSocket.OPEN) {
        ws2.send(data);
      } else {
        this._terminal.writeLine('ws2 is not open. Dropping message.');
      }
    });
    ws2.on('message', (data) => {
      if (ws1.readyState === WebSocket.OPEN) {
        ws1.send(data);
      } else {
        this._terminal.writeLine('ws1 is not open. Dropping message.');
      }
    });

    ws1.once('close', () => {
      if (ws2.readyState === WebSocket.OPEN) {
        ws2.close();
      }
    });
    ws2.once('close', () => {
      if (ws1.readyState === WebSocket.OPEN) {
        ws1.close();
      }
    });

    ws1.once('error', (error) => {
      this._terminal.writeLine(`WebSocket error: ${getNormalizedErrorString(error)}`);
    });
    ws2.once('error', (error) => {
      this._terminal.writeLine(`WebSocket error: ${getNormalizedErrorString(error)}`);
    });
  }

  /**
   * Initializes the Playwright browser tunnel by establishing a WebSocket connection
   * and setting up the browser server.
   * Returns when the handshake is complete and the browser server is running.
   */
  private async _initPlaywrightBrowserTunnelAsync(): Promise<WebSocket> {
    let handshake: IHandshake | undefined = undefined;
    let client: WebSocket | undefined = undefined;
    let browserServer: BrowserServer | undefined = undefined;

    this.status = 'waiting-for-connection';
    const ws: WebSocket =
      this._mode === 'poll-connection'
        ? await this._pollConnectionAsync()
        : await this._waitForIncomingConnectionAsync();

    ws.on('open', () => {
      this._terminal.writeLine(`WebSocket connection established`);
      handshake = undefined;
    });

    ws.on('error', (error) => {
      this._terminal.writeLine(`WebSocket error occurred: ${getNormalizedErrorString(error)}`);
    });

    ws.on('close', async () => {
      this._initWsPromise = undefined;
      this.status = 'stopped';
      this._terminal.writeLine('WebSocket connection closed');
      await browserServer?.close();
    });

    return await new Promise<WebSocket>((resolve, reject) => {
      const onMessageHandler = async (data: RawData): Promise<void> => {
        const terminal: ITerminal = this._terminal;
        if (!handshake) {
          try {
            const rawHandshake: unknown = JSON.parse(data.toString());
            terminal.writeDebugLine(`Received handshake: ${JSON.stringify(handshake)}`);
            handshake = this._validateHandshake(rawHandshake);

            // Call the onBeforeLaunch callback if provided
            if (this._onBeforeLaunch) {
              terminal.writeLine('Requesting user approval before launching browser server...');
              const shouldProceed: boolean = await this._onBeforeLaunch(handshake);
              if (!shouldProceed) {
                terminal.writeLine('Browser server launch cancelled by user.');
                ws.off('message', onMessageHandler);
                ws.close();
                reject(new Error('Browser server launch cancelled by user'));
                return;
              }
              terminal.writeLine('User approved browser server launch.');
            }

            this.status = 'setting-up-browser-server';
            const browserServerProxy: IBrowserServerProxy =
              await this._getPlaywrightBrowserServerProxyAsync(handshake);
            client = browserServerProxy.client;
            browserServer = browserServerProxy.browserServer;

            this.status = 'browser-server-running';

            // Send ack so that the counterpart also knows to start forwarding messages.
            // NOTE: The 1-second delay is an intentional workaround. In the current
            // protocol, the remote tunnel endpoint does not expose an explicit "ready"
            // signal for when it has finished initializing its own forwarding logic
            // after receiving the initial handshake. Empirically, introducing this
            // delay avoids races where early messages could be dropped or mishandled
            // if they arrive before the remote side is fully ready.
            //
            // A future improvement would be to replace this delay with a deterministic
            // synchronization mechanism (e.g. an explicit "ready" message or event)
            // instead of relying on a fixed timeout.
            await sleep(1000);
            ws.send(JSON.stringify({ action: 'handshakeAck' }));
            await this._setupForwardingAsync(ws, client);

            // Clean up message handler after successful handshake
            ws.off('message', onMessageHandler);
            resolve(ws);
          } catch (error) {
            terminal.writeLine(`Error processing handshake: ${error}`);
            this.status = 'error';

            // Cleanup and close connection on error
            ws.off('message', onMessageHandler);
            ws.close();
            reject(error);
            return;
          }
        } else {
          if (!client) {
            terminal.writeLine('Browser WebSocket client is not initialized.');
            ws.off('message', onMessageHandler);
            ws.close();
            return;
          }
        }
      };
      ws.on('message', onMessageHandler);
    });
  }
}
