// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';

import type { BrowserServer, BrowserType, LaunchOptions } from 'playwright-core';
import { type RawData, WebSocket, type WebSocketServer } from 'ws';

import { TerminalProviderSeverity, TerminalStreamWritable, type ITerminal } from '@rushstack/terminal';
import { Executable, FileSystem, Async } from '@rushstack/node-core-library';

import {
  getNormalizedErrorString,
  getWebSocketCloseReason,
  getWebSocketReadyStateString,
  WebSocketCloseCode
} from './utilities';
import { LaunchOptionsValidator, type ILaunchOptionsValidationResult } from './LaunchOptionsValidator';

/**
 * Allowed Playwright browser names.
 * @beta
 */
export type BrowserName = 'chromium' | 'firefox' | 'webkit';
const validBrowserNames: Set<string> = new Set(['chromium', 'firefox', 'webkit'] satisfies BrowserName[]);
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
  playwrightVersion: string;
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

/**
 * Hosts a Playwright browser server and forwards traffic over a WebSocket tunnel.
 * @beta
 */
export class PlaywrightTunnel {
  readonly #terminal: ITerminal;
  readonly #onStatusChange: (status: TunnelStatus) => void;
  readonly #onBeforeLaunch?: (handshake: IHandshake) => Promise<boolean> | boolean;
  readonly #playwrightBrowsersInstalled: Set<string> = new Set();
  readonly #wsEndpoint: string | undefined;
  readonly #listenPort: number | undefined;
  readonly #playwrightInstallPath: string;
  #status: TunnelStatus = 'stopped';
  #initWsPromise?: Promise<WebSocket>;
  #keepRunning: boolean = false;
  #ws?: WebSocket;
  #mode: TunnelMode;
  #pendingConnectionAttempt?: Promise<WebSocket>;
  #pollInterval?: NodeJS.Timeout;

  public constructor(options: IPlaywrightTunnelOptions) {
    const { mode, terminal, onStatusChange, playwrightInstallPath, onBeforeLaunch } = options;

    switch (mode) {
      case 'poll-connection':
        if (!options.wsEndpoint) {
          throw new Error('wsEndpoint is required for poll-connection mode');
        }
        this.#wsEndpoint = options.wsEndpoint;
        this.#listenPort = undefined;
        break;
      case 'wait-for-incoming-connection':
        if (options.listenPort === undefined) {
          throw new Error('listenPort is required for wait-for-incoming-connection mode');
        }
        this.#wsEndpoint = undefined;
        this.#listenPort = options.listenPort;
        break;
      default:
        throw new Error(`Invalid mode: ${mode}`);
    }

    this.#mode = mode;
    this.#terminal = terminal;
    this.#onStatusChange = onStatusChange;
    this.#onBeforeLaunch = onBeforeLaunch;
    this.#playwrightInstallPath = playwrightInstallPath;
  }

  public get status(): TunnelStatus {
    return this.#status;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private set status(newStatus: TunnelStatus) {
    this.#status = newStatus;
    this.#onStatusChange(newStatus);
  }

  public async waitForCloseAsync(): Promise<void> {
    const terminal: ITerminal = this.#terminal;
    const initWsPromise: Promise<WebSocket> | undefined = this.#initWsPromise;
    if (initWsPromise) {
      const ws: WebSocket = await initWsPromise;
      await once(ws, 'close');
      terminal.writeDebugLine('WebSocket connection closed. resolving init promise.');
      this.#initWsPromise = undefined;
    }
  }

  public async startAsync(options: { keepRunning?: boolean } = {}): Promise<void> {
    this.#keepRunning = options.keepRunning ?? true;
    const terminal: ITerminal = this.#terminal;
    terminal.writeLine(`keepRunning: ${this.#keepRunning}`);
    while (this.#keepRunning) {
      if (!this.#initWsPromise) {
        this.#initWsPromise = this._initPlaywrightBrowserTunnelAsync();
      } else {
        terminal.writeLine(`Tunnel is already running with status: ${this.status}`);
      }
      await this.waitForCloseAsync();
    }
  }

  public async stopAsync(): Promise<void> {
    this.#keepRunning = false;
    if (this.#pollInterval) {
      clearInterval(this.#pollInterval);
      this.#pollInterval = undefined;
    }
    await this.#initWsPromise?.finally(() => {
      this.#ws?.close(WebSocketCloseCode.NORMAL_CLOSURE, 'Tunnel stopped');
    });
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#terminal.writeLine('Disposing WebSocket connection.');
    await this.stopAsync();
  }

  public async cleanTempFilesAsync(): Promise<void> {
    const tmpPath: string = this.#playwrightInstallPath;
    this.#terminal.writeLine(`Cleaning up temporary files in ${tmpPath}`);
    try {
      await FileSystem.ensureEmptyFolderAsync(tmpPath);
      this.#terminal.writeLine(`Temporary files cleaned up.`);
    } catch (error) {
      this.#terminal.writeLine(`Failed to clean up temporary files: ${getNormalizedErrorString(error)}`);
    }
  }

  // TODO: We should implement an uninstall command to remove installed Playwright browsers
  // public async uninstallPlaywrightBrowsersAsync(): Promise<void> {}

  private async _runCommandAsync(command: string, args: string[]): Promise<void> {
    const tmpPath: string = this.#playwrightInstallPath;
    await FileSystem.ensureFolderAsync(tmpPath);
    this.#terminal.writeLine(`Running command: ${command} ${args.join(' ')} in ${tmpPath}`);

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
        terminal: this.#terminal,
        severity: TerminalProviderSeverity.log
      })
    );
    cp.stderr?.pipe(
      new TerminalStreamWritable({
        terminal: this.#terminal,
        severity: TerminalProviderSeverity.error
      })
    );

    await Executable.waitForExitAsync(cp, { throwOnNonZeroExitCode: true, throwOnSignal: true });
  }

  private async _installPlaywrightCoreAsync({
    playwrightVersion
  }: Pick<IHandshake, 'playwrightVersion'>): Promise<void> {
    this.#terminal.writeLine(`Installing playwright-core version ${playwrightVersion}`);
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
    this.#terminal.writeLine(`Executing playwright-core version ${playwrightVersion}`);
    await this._runCommandAsync('node', [
      `node_modules/playwright-core-${playwrightVersion}/cli.js`,
      'install',
      browserName
    ]);
  }

  private async _tryConnectAsync(): Promise<WebSocket> {
    const wsEndpoint: string | undefined = this.#wsEndpoint;
    if (!wsEndpoint) {
      throw new Error('WebSocket endpoint is not defined');
    }
    return await new Promise<WebSocket>((resolve, reject) => {
      const ws: WebSocket = new WebSocket(wsEndpoint);
      ws.on('open', () => {
        this.#terminal.writeLine(`WebSocket connection opened`);
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
    this.#terminal.writeLine(`Waiting for WebSocket connection`);
    return await new Promise((resolve, reject) => {
      this.#pollInterval = setInterval(() => {
        if (this.#pendingConnectionAttempt) {
          return; // Skip if a connection attempt is already in progress
        }
        const connectionPromise: Promise<WebSocket> = this._tryConnectAsync();
        this.#pendingConnectionAttempt = connectionPromise;
        connectionPromise
          .then((ws: WebSocket) => {
            clearInterval(this.#pollInterval);
            this.#pollInterval = undefined;
            ws.removeAllListeners();
            this.#pendingConnectionAttempt = undefined;
            resolve(ws);
          })
          .catch(() => {
            // no-op - will retry on next interval
            this.#pendingConnectionAttempt = undefined;
          });
      }, 500);
    });
  }

  private async _waitForIncomingConnectionAsync(): Promise<WebSocket> {
    this.#terminal.writeLine('Waiting for incoming WebSocket connection');

    return await new Promise<WebSocket>((resolve, reject) => {
      const server: WebSocketServer = new WebSocket.Server({ port: this.#listenPort });

      const cleanup = (): void => {
        server.removeAllListeners();
      };

      server.once('connection', (ws) => {
        this.#terminal.writeLine('Incoming WebSocket connection established');

        // Stop listening immediately so the port is released
        cleanup();
        server.close((closeError?: Error) => {
          if (closeError) {
            this.#terminal.writeLine(
              `Failed to close WebSocket server: ${
                closeError instanceof Error ? closeError.message : closeError
              }`
            );
          }
          resolve(ws);
        });
      });

      server.once('error', (error) => {
        this.#terminal.writeLine(`WebSocket server error: ${getNormalizedErrorString(error)}`);

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
    this.#terminal.writeLine(`Checking for installed playwright browsers. Installed browsers: ${browserKey}`);
    if (!this.#playwrightBrowsersInstalled.has(browserKey)) {
      this.#terminal.writeLine(
        `Playwright browser not found. Installing playwright-core version ${playwrightVersion}`
      );
      await this._installPlaywrightBrowsersAsync({ playwrightVersion, browserName });
      this.#playwrightBrowsersInstalled.add(browserKey);
    }

    this.#terminal.writeLine(`Using playwright-core version ${playwrightVersion} for browser server`);
    return await import(`${this.#playwrightInstallPath}/node_modules/playwright-core-${playwrightVersion}`);
  }

  private async _getPlaywrightBrowserServerProxyAsync({
    browserName,
    playwrightVersion,
    launchOptions
  }: Pick<IHandshake, 'playwrightVersion' | 'browserName' | 'launchOptions'>): Promise<IBrowserServerProxy> {
    const terminal: ITerminal = this.#terminal;

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
    const browsers: Record<BrowserName, BrowserType> = { chromium, firefox, webkit };

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

    if (!isValidBrowserName(browserName)) {
      throw new Error(
        `Invalid browser name: ${browserName}. Must be one of ${Array.from(validBrowserNames).join(', ')}.`
      );
    }

    return {
      action,
      launchOptions: launchOptions as LaunchOptions,
      playwrightVersion,
      browserName
    };
  }

  // ws1 is the tunnel websocket, ws2 is the browser server websocket
  private async _setupForwardingAsync(ws1: WebSocket, ws2: WebSocket): Promise<void> {
    this.#terminal.writeLine('Setting up message forwarding between ws1 and ws2');
    this.#terminal.writeLine(`  ws1 (tunnel) readyState: ${getWebSocketReadyStateString(ws1.readyState)}`);
    this.#terminal.writeLine(`  ws2 (browser) readyState: ${getWebSocketReadyStateString(ws2.readyState)}`);

    const messageCount: { ws1ToWs2: number; ws2ToWs1: number } = { ws1ToWs2: 0, ws2ToWs1: 0 };

    ws1.on('message', (data) => {
      messageCount.ws1ToWs2++;
      if (ws2.readyState === WebSocket.OPEN) {
        ws2.send(data);
      } else {
        this.#terminal.writeLine(
          `ws2 not open (state: ${getWebSocketReadyStateString(ws2.readyState)}). Dropping message #${messageCount.ws1ToWs2}`
        );
      }
    });
    ws2.on('message', (data) => {
      messageCount.ws2ToWs1++;
      if (ws1.readyState === WebSocket.OPEN) {
        ws1.send(data);
      } else {
        this.#terminal.writeLine(
          `ws1 not open (state: ${getWebSocketReadyStateString(ws1.readyState)}). Dropping message #${messageCount.ws2ToWs1}`
        );
      }
    });

    ws1.once('close', (code: number, reason: Buffer) => {
      const reasonStr: string = reason.toString() || 'no reason provided';
      const codeDescription: string = getWebSocketCloseReason(code);
      this.#terminal.writeLine(
        `ws1 (tunnel) closed - code: ${code} (${codeDescription}), reason: ${reasonStr}`
      );
      this.#terminal.writeLine(
        `  Messages forwarded: ws1->ws2: ${messageCount.ws1ToWs2}, ws2->ws1: ${messageCount.ws2ToWs1}`
      );
      if (ws2.readyState === WebSocket.OPEN) {
        this.#terminal.writeLine('  Closing ws2 (browser) in response');
        ws2.close(WebSocketCloseCode.NORMAL_CLOSURE, 'Tunnel closed');
      }
    });
    ws2.once('close', (code: number, reason: Buffer) => {
      const reasonStr: string = reason.toString() || 'no reason provided';
      const codeDescription: string = getWebSocketCloseReason(code);
      this.#terminal.writeLine(
        `ws2 (browser) closed - code: ${code} (${codeDescription}), reason: ${reasonStr}`
      );
      this.#terminal.writeLine(
        `  Messages forwarded: ws1->ws2: ${messageCount.ws1ToWs2}, ws2->ws1: ${messageCount.ws2ToWs1}`
      );
      if (ws1.readyState === WebSocket.OPEN) {
        this.#terminal.writeLine('  Closing ws1 (tunnel) in response');
        ws1.close(WebSocketCloseCode.NORMAL_CLOSURE, 'Browser closed');
      }
    });

    ws1.once('error', (error) => {
      this.#terminal.writeErrorLine(`ws1 (tunnel) WebSocket error: ${getNormalizedErrorString(error)}`);
      this.#terminal.writeErrorLine(`  ws1 readyState: ${getWebSocketReadyStateString(ws1.readyState)}`);
    });
    ws2.once('error', (error) => {
      this.#terminal.writeErrorLine(`ws2 (browser) WebSocket error: ${getNormalizedErrorString(error)}`);
      this.#terminal.writeErrorLine(`  ws2 readyState: ${getWebSocketReadyStateString(ws2.readyState)}`);
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
      this.#mode === 'poll-connection'
        ? await this._pollConnectionAsync()
        : await this._waitForIncomingConnectionAsync();

    ws.on('open', () => {
      this.#terminal.writeLine(`WebSocket connection established`);
      handshake = undefined;
    });

    ws.on('error', (error) => {
      this.#terminal.writeLine(`WebSocket error occurred: ${getNormalizedErrorString(error)}`);
    });

    ws.on('close', async (code: number, reason: Buffer) => {
      const reasonStr: string = reason.toString() || 'no reason provided';
      const codeDescription: string = getWebSocketCloseReason(code);
      this.#initWsPromise = undefined;
      this.status = 'stopped';
      this.#terminal.writeLine(
        `WebSocket connection closed - code: ${code} (${codeDescription}), reason: ${reasonStr}`
      );
      this.#terminal.writeLine(`  handshake received: ${handshake !== undefined}`);
      this.#terminal.writeLine(`  browserServer active: ${browserServer !== undefined}`);
      if (browserServer) {
        this.#terminal.writeLine('  Closing browser server...');
        await browserServer.close();
        this.#terminal.writeLine('  Browser server closed');
      }
    });

    return await new Promise<WebSocket>((resolve, reject) => {
      const onMessageHandler = async (data: RawData): Promise<void> => {
        const terminal: ITerminal = this.#terminal;
        if (!handshake) {
          try {
            const rawHandshakeString: string = data.toString();
            const rawHandshake: unknown = JSON.parse(rawHandshakeString);
            terminal.writeLine(`Received handshake: ${rawHandshakeString}`);
            handshake = this._validateHandshake(rawHandshake);

            // Call the onBeforeLaunch callback if provided
            if (this.#onBeforeLaunch) {
              terminal.writeLine('Requesting user approval before launching browser server...');
              const shouldProceed: boolean = await this.#onBeforeLaunch(handshake);
              if (!shouldProceed) {
                terminal.writeLine('Browser server launch cancelled by user.');
                ws.off('message', onMessageHandler);
                ws.close(WebSocketCloseCode.NORMAL_CLOSURE, 'Launch cancelled by user');
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

            // Monitor browser server process for crashes
            const browserProcess: ChildProcess | null = browserServer.process();
            if (browserProcess) {
              browserProcess.on('exit', (code: number | null, signal: string | null) => {
                terminal.writeErrorLine(`Browser server process exited - code: ${code}, signal: ${signal}`);
              });
              browserProcess.on('error', (err: Error) => {
                terminal.writeErrorLine(`Browser server process error: ${getNormalizedErrorString(err)}`);
              });
              terminal.writeDebugLine(`Browser server process started with PID: ${browserProcess.pid}`);
            } else {
              terminal.writeDebugLine('Warning: Browser server process handle not available for monitoring');
            }

            this.status = 'browser-server-running';

            // Send ack so that the counterpart also knows to start forwarding messages.
            // NOTE: The 1-second delay is an intentional workaround. In the current
            // protocol, the remote tunnel endpoint does not expose an explicit "ready"
            // signal for when it has finished initializing its own forwarding logic
            // after receiving the initial handshake. This
            // delay avoids races where early messages could be dropped or mishandled
            // if they arrive before the remote side is fully ready.
            //
            // TODO: A future improvement would be to replace this delay with a deterministic
            // synchronization mechanism (e.g. an explicit "ready" message or event)
            // instead of relying on a fixed timeout.
            await Async.sleepAsync(2000);

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
            ws.close(WebSocketCloseCode.INTERNAL_ERROR, 'Handshake error');
            reject(error);
            return;
          }
        } else {
          if (!client) {
            terminal.writeLine('Browser WebSocket client is not initialized.');
            ws.off('message', onMessageHandler);
            ws.close(WebSocketCloseCode.INTERNAL_ERROR, 'Browser client not initialized');
            return;
          }
        }
      };
      ws.on('message', onMessageHandler);
    });
  }
}
