// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { BrowserServer, BrowserType, LaunchOptions } from 'playwright-core';
import { WebSocket, type WebSocketServer } from 'ws';
import { TerminalProviderSeverity, TerminalStreamWritable, type ITerminal } from '@rushstack/terminal';
import { Executable, FileSystem } from '@rushstack/node-core-library';
import semver from 'semver';
import type { ChildProcess } from 'child_process';

export type BrowserNames = 'chromium' | 'firefox' | 'webkit';
const validBrowserNames: Set<string> = new Set(['chromium', 'firefox', 'webkit']);
function isValidBrowserName(browserName: string): browserName is BrowserNames {
  return validBrowserNames.has(browserName);
}

export type TunnelStatus =
  | 'waiting-for-connection'
  | 'browser-server-running'
  | 'stopped'
  | 'setting-up-browser-server'
  | 'error';

interface IHandshake {
  action: 'handshake';
  browserName: BrowserNames;
  launchOptions: LaunchOptions;
  playwrightVersion: semver.SemVer;
}

type ITunnelMode = 'poll-connection' | 'wait-for-incoming-connection';

export type IPlaywrightTunnelOptions = {
  terminal: ITerminal;
  onStatusChange: (status: TunnelStatus) => void;
  tmpPath: string;
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

export class PlaywrightTunnel {
  private readonly _terminal: ITerminal;
  private readonly _onStatusChange: (status: TunnelStatus) => void;
  private readonly _playwrightBrowsersInstalled: Set<string> = new Set();
  private _status: TunnelStatus = 'stopped';
  private _initWsPromise?: Promise<WebSocket>;
  private _keepRunning: boolean = false;
  private _ws?: WebSocket;
  private _mode: ITunnelMode;
  private readonly _wsEndpoint?: string;
  private readonly _listenPort?: number;
  private readonly _tmpPath: string;

  public constructor(options: IPlaywrightTunnelOptions) {
    const { mode, terminal, onStatusChange, tmpPath } = options;

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
    this._tmpPath = tmpPath;
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
    await new Promise<void>((resolve) => {
      void this._initWsPromise?.then((ws) => {
        ws.on('close', () => {
          terminal.writeLine('WebSocket connection closed. resolving init promise.');
          this._initWsPromise = undefined;
          resolve();
        });
      });
    });
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
    const tmpPath: string = this._tmpPath;
    this._terminal.writeLine(`Cleaning up temporary files in ${tmpPath}`);
    try {
      await FileSystem.ensureEmptyFolderAsync(tmpPath);
      this._terminal.writeLine(`Temporary files cleaned up.`);
    } catch (error) {
      this._terminal.writeLine(
        `Failed to clean up temporary files: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  public async uninstallPlaywrightBrowsersAsync(): Promise<void> {
    try {
      const playwrightVersion: semver.SemVer | null = semver.coerce('latest');
      if (!playwrightVersion) {
        throw new Error('Failed to parse semver');
      }
      await this._installPlaywrightCoreAsync({ playwrightVersion });
      this._terminal.writeLine(`Uninstalling browsers`);
      await this._runCommandAsync('node', [
        `node_modules/playwright-core-${playwrightVersion}/cli.js`,
        'uninstall',
        '--all'
      ]);
    } catch (error) {
      this._terminal.writeLine(
        `Failed to uninstall browsers: ${error instanceof Error ? error.message : error}`
      );
    }

    await this.cleanTempFilesAsync();
  }

  private async _runCommandAsync(command: string, args: string[]): Promise<void> {
    const tmpPath: string = this._tmpPath;
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

    await Executable.waitForExitAsync(cp);
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
    this._terminal.writeLine(`Installing browsers for playwright-core version ${playwrightVersion}`);
    await this._runCommandAsync('node', [
      `node_modules/playwright-core-${playwrightVersion}/cli.js`,
      'install',
      browserName
    ]);
  }

  private _tryConnectAsync(): Promise<WebSocket> {
    const wsEndpoint: string | undefined = this._wsEndpoint;
    if (!wsEndpoint) {
      return Promise.reject(new Error('WebSocket endpoint is not defined'));
    }
    return new Promise<WebSocket>((resolve, reject) => {
      const ws: WebSocket = new WebSocket(wsEndpoint);
      ws.on('open', () => {
        this._terminal.writeLine(`WebSocket connection opened`);
        resolve(ws);
      });
      ws.on('error', (error) => {
        reject(error);
      });
    });
  }

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
      }, 1000);
    });
  }

  private async _waitForIncomingConnectionAsync(): Promise<WebSocket> {
    this._terminal.writeLine(`Waiting for incoming WebSocket connection`);
    return new Promise<WebSocket>((resolve, reject) => {
      const server: WebSocketServer = new WebSocket.Server({ port: this._listenPort });
      server.on('connection', (ws) => {
        this._terminal.writeLine(`Incoming WebSocket connection established`);
        server.removeAllListeners();
        resolve(ws);
      });
      server.on('error', (error) => {
        this._terminal.writeLine(`WebSocket server error: ${error instanceof Error ? error.message : error}`);
        reject(error);
      });
    });
  }

  private async _setupPlaywrightAsync({
    playwrightVersion,
    browserName
  }: Pick<IHandshake, 'playwrightVersion' | 'browserName'>): Promise<typeof import('playwright-core')> {
    const browserKey: string = `${playwrightVersion}-${browserName}`;
    if (!this._playwrightBrowsersInstalled.has(browserKey)) {
      this._terminal.writeLine(`Installing playwright-core version ${playwrightVersion}`);
      await this._installPlaywrightBrowsersAsync({ playwrightVersion, browserName });
      this._playwrightBrowsersInstalled.add(browserKey);
    }

    this._terminal.writeLine(`Using playwright-core version ${playwrightVersion} for browser server`);
    return require(`${this._tmpPath}/node_modules/playwright-core-${playwrightVersion}`);
  }

  private async _getPlaywrightBrowserServerProxyAsync({
    browserName,
    playwrightVersion,
    launchOptions
  }: Pick<IHandshake, 'playwrightVersion' | 'browserName' | 'launchOptions'>): Promise<IBrowserServerProxy> {
    const terminal: ITerminal = this._terminal;
    const playwright: typeof import('playwright-core') = await this._setupPlaywrightAsync({
      playwrightVersion,
      browserName
    });

    const { chromium, firefox, webkit } = playwright;
    const browsers: Record<ISupportedBrowsers, BrowserType> = { chromium, firefox, webkit };
    const browserServer: BrowserServer = await browsers[browserName].launchServer({
      ...launchOptions,
      headless: false
    });
    if (!browserServer) {
      throw new Error(
        `Failed to launch browser server for ${browserName} with options: ${JSON.stringify(launchOptions)}`
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

  private async _setupForwardingAsync(ws1: WebSocket, ws2: WebSocket): Promise<void> {
    console.log('Setting up message forwarding between ws1 and ws2');
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

    ws1.on('close', () => {
      if (ws2.readyState === WebSocket.OPEN) {
        ws2.close();
      }
    });
    ws2.on('close', () => {
      if (ws1.readyState === WebSocket.OPEN) {
        ws1.close();
      }
    });

    ws1.on('error', (error) => {
      this._terminal.writeLine(`WebSocket error: ${error instanceof Error ? error.message : error}`);
    });
    ws2.on('error', (error) => {
      this._terminal.writeLine(`WebSocket error: ${error instanceof Error ? error.message : error}`);
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

    ws.onerror = (error) => {
      this._terminal.writeLine(`WebSocket error occurred: ${error instanceof Error ? error.message : error}`);
    };

    ws.onclose = async () => {
      this._initWsPromise = undefined;
      this.status = 'stopped';
      this._terminal.writeLine('WebSocket connection closed');
      await browserServer?.close();
    };

    return new Promise<WebSocket>((resolve, reject) => {
      ws.onmessage = async (event) => {
        const terminal: ITerminal = this._terminal;
        if (!handshake) {
          try {
            const rawHandshake: unknown = JSON.parse(event.data.toString());
            terminal.writeLine(`Received handshake: ${JSON.stringify(handshake)}`);
            handshake = this._validateHandshake(rawHandshake);
            console.log(`Validated handshake: ${JSON.stringify(handshake)}`);

            this.status = 'setting-up-browser-server';
            const browserServerProxy: IBrowserServerProxy =
              await this._getPlaywrightBrowserServerProxyAsync(handshake);
            client = browserServerProxy.client;
            browserServer = browserServerProxy.browserServer;

            this.status = 'browser-server-running';

            // send ack so that the counterpart also knows to start forwarding messages
            await new Promise((resolve) => setTimeout(resolve, 2000));
            ws.send(JSON.stringify({ action: 'handshakeAck' }));
            await this._setupForwardingAsync(ws, client);
            resolve(ws);
          } catch (error) {
            terminal.writeLine(`Error processing handshake: ${error}`);
            this.status = 'error';
            ws.close();
            return;
          }
        } else {
          if (!client) {
            terminal.writeLine('Browser WebSocket client is not initialized.');
            ws.close();
            return;
          }
        }
      };
    });
  }
}
