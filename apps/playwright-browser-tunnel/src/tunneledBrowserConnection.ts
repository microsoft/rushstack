// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import http from 'node:http';

import playwright from 'playwright-core';
import type { Browser, LaunchOptions } from 'playwright-core';
import { type AddressInfo, WebSocketServer, WebSocket } from 'ws';
import playwrightPackageJson from 'playwright-core/package.json';

const { version: playwrightVersion } = playwrightPackageJson;

export type BrowserNames = 'chromium' | 'firefox' | 'webkit';

/**
 * This HttpServer is used for the localProxyWs WebSocketServer.
 * The purpose is to parse the query params and path for the websocket url to get the
 * browserName and launchOptions.
 */
class HttpServer {
  private readonly _server: http.Server;
  private readonly _wsServer: WebSocketServer; // local proxy websocket server accepting browser clients
  private _listeningPort: number | undefined;

  public constructor() {
    // We'll create an HTTP server and attach a WebSocketServer in noServer mode so we can
    // manually parse the URL and extract query parameters before upgrading.
    this._server = http.createServer();
    this._wsServer = new WebSocketServer({ noServer: true });

    this._server.on('upgrade', (request, socket, head) => {
      // Accept all upgrades on the root path. We parse query string for browserName + launchOptions.
      this._wsServer.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        // Store the request on the websocket instance in a typed field for retrieval in connection handler
        (ws as WebSocket & { upgradeRequest?: http.IncomingMessage }).upgradeRequest = request;
        this._wsServer.emit('connection', ws, request);
      });
    });
  }

  public listen(): Promise<void> {
    return new Promise((resolve) => {
      this._server.listen(0, '127.0.0.1', () => {
        this._listeningPort = (this._server.address() as AddressInfo).port;
        // This MUST be printed to terminal so VS Code can auto-port forward
        console.log(`Local proxy HttpServer listening at ws://127.0.0.1:${this._listeningPort}`);
        resolve();
      });
    });
  }

  public get endpoint(): string {
    if (this._listeningPort === undefined) {
      throw new Error('HttpServer not listening yet');
    }
    return `ws://127.0.0.1:${this._listeningPort}`;
  }

  public get wsServer(): WebSocketServer {
    return this._wsServer;
  }

  public dispose(): void {
    this._wsServer.close();
    this._server.close();
  }
}

interface IHandshake {
  action: 'handshake';
  browserName: BrowserNames;
  launchOptions: LaunchOptions;
  playwrightVersion: string;
}

interface IHandshakeAck {
  action: 'handshakeAck';
}

const LISTEN_PORT: number = 3000;

export interface IDisposableTunneledBrowserConnection {
  remoteEndpoint: string;
  [Symbol.dispose]: () => void;
  closePromise: Promise<void>;
}

export async function tunneledBrowserConnection(): Promise<IDisposableTunneledBrowserConnection> {
  // Server that remote peer (actual browser host) connects to
  const remoteWsServer: WebSocketServer = new WebSocketServer({ port: LISTEN_PORT });
  // Local HTTP + WebSocket server where the playwright client will connect providing params
  const httpServer: HttpServer = new HttpServer();
  await httpServer.listen();
  console.log(`Remote WebSocket server listening on ws://localhost:${LISTEN_PORT}`);

  const localProxyWs: WebSocketServer = httpServer.wsServer;
  const localProxyWsEndpoint: string = httpServer.endpoint;

  let browserName: BrowserNames | undefined;
  let launchOptions: LaunchOptions | undefined;
  let remoteSocket: WebSocket | undefined;
  let handshakeAck: boolean = false;
  let handshakeSent: boolean = false;

  function maybeSendHandshake(): void {
    if (!handshakeSent && remoteSocket && browserName && launchOptions) {
      const handshake: IHandshake = {
        action: 'handshake',
        browserName,
        launchOptions,
        playwrightVersion
      };
      console.log(`Sending handshake to remote: ${JSON.stringify(handshake)}`);
      handshakeSent = true;
      remoteSocket.send(JSON.stringify(handshake));
    }
  }

  return new Promise((resolve) => {
    remoteWsServer.on('error', (error) => {
      console.error(`Remote WebSocket server error: ${error}`);
    });

    remoteWsServer.on('close', () => {
      console.log('Remote WebSocket server closed');
    });

    const bufferedLocalMessages: Array<Buffer | ArrayBuffer | Buffer[] | string> = [];

    remoteWsServer.on('connection', (ws) => {
      console.log('Remote websocket connected');
      remoteSocket = ws;
      handshakeAck = false;
      maybeSendHandshake();

      ws.on('message', (message) => {
        if (!handshakeAck) {
          try {
            const receivedHandshake: IHandshakeAck = JSON.parse(message.toString());
            if (receivedHandshake.action === 'handshakeAck') {
              handshakeAck = true;
              console.log('Received handshakeAck from remote');
            } else {
              console.error('Invalid handshake ack message');
              ws.close();
              return;
            }
          } catch (e) {
            console.error(`Failed parsing handshake ack: ${e}`);
            ws.close();
            return;
          }
          // Resolve only once local proxy available and handshake acknowledged
          if (handshakeAck) {
            // Flush any buffered local messages now that tunnel is active
            const activeRemote: WebSocket | undefined = remoteSocket;
            for (;;) {
              if (!activeRemote || activeRemote.readyState !== WebSocket.OPEN) {
                break;
              }
              if (bufferedLocalMessages.length === 0) {
                break;
              }
              const m: Buffer | ArrayBuffer | Buffer[] | string | undefined = bufferedLocalMessages.shift();
              if (m !== undefined) {
                console.log(`Flushing buffered local message to remote: ${m}`);
                activeRemote.send(m);
              }
            }
          }
        } else {
          // Forward from remote to all local clients
          localProxyWs.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(message);
            }
          });
        }
      });

      ws.on('close', () => console.log('Remote websocket closed'));
      ws.on('error', (err) => console.error(`Remote websocket error: ${err}`));
    });

    localProxyWs.on('connection', (localWs, request) => {
      try {
        const urlString: string | undefined = request?.url;
        if (urlString) {
          const parsed: URL = new URL(urlString, 'http://localhost');
          console.log(`Local client connected with query params: ${parsed.searchParams.toString()}`);
          const bName: string | null = parsed.searchParams.get('browser');
          if (bName && ['chromium', 'firefox', 'webkit'].includes(bName)) {
            browserName = bName as BrowserNames;
          }
          const launchOptionsParam: string | null = parsed.searchParams.get('launchOptions');
          if (launchOptionsParam) {
            try {
              launchOptions = JSON.parse(launchOptionsParam);
            } catch (e) {
              console.error('Invalid launchOptions JSON provided');
            }
          }
        }
      } catch (e) {
        console.error(`Error parsing local connection query params: ${e}`);
      }

      if (!browserName) {
        console.error('browser query param required (chromium|firefox|webkit)');
        localWs.close();
        return;
      }
      if (!launchOptions) {
        launchOptions = {} as LaunchOptions; // default empty if not provided
      }

      maybeSendHandshake();

      localWs.on('message', (message) => {
        if (handshakeAck && remoteSocket && remoteSocket.readyState === WebSocket.OPEN) {
          remoteSocket.send(message);
        } else {
          // Buffer until handshakeAck to avoid losing early protocol messages from Playwright
          bufferedLocalMessages.push(message);
        }
      });
      localWs.on('close', () => console.log('Local client websocket closed'));
      localWs.on('error', (err) => console.error(`Local client websocket error: ${err}`));
    });

    // Resolve immediately so caller can initiate local connection with query params (handshake completes later)
    resolve({
      remoteEndpoint: localProxyWsEndpoint,
      [Symbol.dispose]() {},
      // eslint-disable-next-line promise/param-names
      closePromise: new Promise<void>((resolve2) => {
        remoteWsServer.on('close', () => {
          resolve2();
        });
      })
    });
  });
}

interface IDisposableTunneledBrowser {
  browser: Browser;
  [Symbol.asyncDispose]: () => Promise<void>;
}

export async function tunneledBrowser(
  browserName: BrowserNames,
  launchOptions: LaunchOptions
): Promise<IDisposableTunneledBrowser> {
  // Establish the tunnel first (remoteEndpoint here refers to local proxy endpoint for connect())
  using connection: IDisposableTunneledBrowserConnection = await tunneledBrowserConnection();
  const { remoteEndpoint } = connection;
  // Append query params for browser and launchOptions
  const urlObj: URL = new URL(remoteEndpoint);
  urlObj.searchParams.set('browser', browserName);
  urlObj.searchParams.set('launchOptions', JSON.stringify(launchOptions || {}));
  const connectEndpoint: string = urlObj.toString();
  const browser: Browser = await playwright[browserName].connect(connectEndpoint);
  console.log(`Connected to remote browser at ${connectEndpoint}`);

  return {
    browser,
    async [Symbol.asyncDispose]() {
      console.log('Disposing browser');
      await browser.close();
    }
  };
}
