// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { WebSocketServer, type WebSocket } from 'ws';

import type { ITerminal } from '@rushstack/terminal';

const LOCALHOST: string = 'localhost';

/**
 * This HttpServer is used for the localProxyWs WebSocketServer.
 * The purpose is to parse the query params and path for the websocket url to get the
 * browserName and launchOptions.
 */
export class HttpServer {
  private readonly _server: http.Server;
  private readonly _wsServer: WebSocketServer; // local proxy websocket server accepting browser clients
  private _listeningAddress: string | undefined;
  private _logger: ITerminal;

  public constructor(logger: ITerminal) {
    this._logger = logger;
    // We'll create an HTTP server and attach a WebSocketServer in noServer mode so we can
    // manually parse the URL and extract query parameters before upgrading.
    this._server = http.createServer();
    this._wsServer = new WebSocketServer({ noServer: true });

    this._server.on('upgrade', (request, socket, head) => {
      // Accept all upgrades on the root path. We parse query string for browserName + launchOptions.
      this._wsServer.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        this._wsServer.emit('connection', ws, request);
      });
    });
  }

  public listen(): Promise<void> {
    return new Promise((resolve) => {
      this._server.listen(0, LOCALHOST, () => {
        const addressInfo = this._server.address() as AddressInfo;
        if (!addressInfo) {
          throw new Error('Failed to get server address');
        }
        // Handle IPv6 addresses with proper formatting
        const formattedAddress: string =
          addressInfo.family === 'IPv6'
            ? `[${addressInfo.address}]:${addressInfo.port}`
            : `${addressInfo.address}:${addressInfo.port}`;
        this._listeningAddress = formattedAddress;
        // This MUST be printed to terminal so VS Code can auto-port forward
        this._logger.writeLine(`Local proxy HttpServer listening at ws://${formattedAddress}`);
        resolve();
      });
    });
  }

  public get endpoint(): string {
    if (this._listeningAddress === undefined) {
      throw new Error('HttpServer not listening yet');
    }
    return `ws://${this._listeningAddress}`;
  }

  public get wsServer(): WebSocketServer {
    return this._wsServer;
  }

  public [Symbol.dispose](): void {
    this._wsServer.close();
    this._server.close();
  }
}
