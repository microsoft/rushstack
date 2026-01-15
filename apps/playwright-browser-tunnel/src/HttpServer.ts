// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import http from 'node:http';

import { WebSocketServer, type WebSocket, type AddressInfo } from 'ws';

import type { ITerminal } from '@rushstack/terminal';

/**
 * This HttpServer is used for the localProxyWs WebSocketServer.
 * The purpose is to parse the query params and path for the websocket url to get the
 * browserName and launchOptions.
 */
export class HttpServer {
  private readonly _server: http.Server;
  private readonly _wsServer: WebSocketServer; // local proxy websocket server accepting browser clients
  private _listeningPort: number | undefined;
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
        this._logger.writeLine(`Local proxy HttpServer listening at ws://127.0.0.1:${this._listeningPort}`);
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

  public [Symbol.dispose](): void {
    this._wsServer.close();
    this._server.close();
  }
}
