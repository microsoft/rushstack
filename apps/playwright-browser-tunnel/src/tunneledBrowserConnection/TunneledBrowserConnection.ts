// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LaunchOptions } from 'playwright-core';
import playwrightPackageJson from 'playwright-core/package.json';
import type { RawData } from 'ws';
import { WebSocket, WebSocketServer } from 'ws';

import type { ITerminal } from '@rushstack/terminal';

import { HttpServer } from '../HttpServer.ts';
import type { BrowserName } from '../PlaywrightBrowserTunnel.ts';
import {
  getNormalizedErrorString,
  getWebSocketCloseReason,
  getWebSocketReadyStateString,
  WebSocketCloseCode
} from '../utilities.ts';
import type {
  IDisposableTunneledBrowserConnection,
  IHandshake,
  IHandshakeAck
} from './ITunneledBrowserConnection.ts';
import { DEFAULT_LISTEN_PORT, SUPPORTED_BROWSER_NAMES } from './constants.ts';

/**
 * Creates a tunneled WebSocket endpoint that a local Playwright client can connect to.
 * @beta
 */
export async function tunneledBrowserConnection(
  logger: ITerminal,
  port: number = DEFAULT_LISTEN_PORT,
  playwrightVersion: string = playwrightPackageJson.version
): Promise<IDisposableTunneledBrowserConnection> {
  // Server that remote peer (actual browser host) connects to
  const remoteWsServer: WebSocketServer = new WebSocketServer({ port });
  // Local HTTP + WebSocket server where the playwright client will connect providing params
  const httpServer: HttpServer = new HttpServer(logger);
  await httpServer.listenAsync();
  logger.writeLine(`Remote WebSocket server listening on ws://localhost:${port}`);

  const localProxyWs: WebSocketServer = httpServer.wsServer;
  const localProxyWsEndpoint: string = httpServer.endpoint;

  let browserName: BrowserName | undefined;
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
      // Log handshake without 'headless' to avoid confusion (tunnel enforces headless: false)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { headless, ...logOptions } = launchOptions;
      const logHandshake: Omit<IHandshake, 'launchOptions'> & {
        launchOptions: Omit<LaunchOptions, 'headless'>;
      } = {
        ...handshake,
        launchOptions: logOptions
      };
      logger.writeLine(`Sending handshake to remote: ${JSON.stringify(logHandshake)}`);
      handshakeSent = true;
      remoteSocket.send(JSON.stringify(handshake));
    }
  }

  return await new Promise((resolve) => {
    remoteWsServer.on('error', (error) => {
      logger.writeErrorLine(`Remote WebSocket server error: ${error}`);
    });

    remoteWsServer.on('close', () => {
      logger.writeLine('Remote WebSocket server closed');
    });

    const bufferedLocalMessages: Array<RawData> = [];

    remoteWsServer.on('connection', (ws) => {
      logger.writeLine('Remote websocket connected');
      remoteSocket = ws;
      handshakeAck = false;
      maybeSendHandshake();

      ws.on('message', (message) => {
        if (!handshakeAck) {
          try {
            const receivedHandshake: IHandshakeAck = JSON.parse(message.toString());
            if (receivedHandshake.action === 'handshakeAck') {
              handshakeAck = true;
              logger.writeLine('Received handshakeAck from remote');
            } else {
              logger.writeErrorLine('Invalid handshake ack message');
              ws.close(WebSocketCloseCode.PROTOCOL_ERROR, 'Invalid handshake ack');
              return;
            }
          } catch (e) {
            logger.writeErrorLine(`Failed parsing handshake ack: ${e}`);
            ws.close(WebSocketCloseCode.PROTOCOL_ERROR, 'Failed parsing handshake');
            return;
          }
          // Resolve only once local proxy available and handshake acknowledged
          if (handshakeAck) {
            // Flush any buffered local messages now that tunnel is active
            const activeRemote: WebSocket | undefined = remoteSocket;
            if (activeRemote && activeRemote.readyState === WebSocket.OPEN) {
              while (bufferedLocalMessages.length > 0) {
                const m: Buffer | ArrayBuffer | Buffer[] | string | undefined = bufferedLocalMessages.shift();
                if (m !== undefined) {
                  logger.writeLine(`Flushing buffered local message to remote: ${m}`);
                  activeRemote.send(m);
                }
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

      ws.on('close', (code: number, reason: Buffer) => {
        const reasonStr: string = reason.toString() || 'no reason provided';
        const codeDescription: string = getWebSocketCloseReason(code);
        logger.writeDebugLine(
          `Remote websocket closed - code: ${code} (${codeDescription}), reason: ${reasonStr}`
        );
        logger.writeDebugLine(
          `  Connection state at close: handshakeSent=${handshakeSent}, handshakeAck=${handshakeAck}`
        );
        logger.writeDebugLine(`  Buffered messages pending: ${bufferedLocalMessages.length}`);
      });
      ws.on('error', (err: Error) => {
        logger.writeErrorLine(`Remote websocket error: ${getNormalizedErrorString(err)}`);
        logger.writeErrorLine(`  Socket readyState: ${getWebSocketReadyStateString(ws.readyState)}`);
      });
    });

    localProxyWs.on('connection', (localWs, request) => {
      try {
        const urlString: string | undefined = request?.url;
        if (urlString) {
          const parsed: URL = new URL(urlString, 'http://localhost');
          logger.writeLine(`Local client connected with query params: ${parsed.searchParams.toString()}`);
          const bName: string | null = parsed.searchParams.get('browser');
          if (bName && SUPPORTED_BROWSER_NAMES.has(bName)) {
            browserName = bName as BrowserName;
          }
          const launchOptionsParam: string | null = parsed.searchParams.get('launchOptions');
          if (launchOptionsParam) {
            try {
              launchOptions = JSON.parse(launchOptionsParam);
            } catch (e) {
              logger.writeErrorLine('Invalid launchOptions JSON provided');
            }
          }
        }
      } catch (e) {
        logger.writeErrorLine(`Error parsing local connection query params: ${e}`);
      }

      if (!browserName) {
        const supportedBrowsersString: string = Array.from(SUPPORTED_BROWSER_NAMES).join('|');
        logger.writeErrorLine(`browser query param required (${supportedBrowsersString})`);
        localWs.close(WebSocketCloseCode.PROTOCOL_ERROR, 'Missing browser param');
        return;
      }
      if (!launchOptions) {
        launchOptions = {} as LaunchOptions; // default empty if not provided
      }

      maybeSendHandshake();

      localWs.on('message', (message) => {
        if (handshakeAck && remoteSocket?.readyState === WebSocket.OPEN) {
          remoteSocket.send(message);
        } else {
          // Buffer until handshakeAck to avoid losing early protocol messages from Playwright
          bufferedLocalMessages.push(message);
        }
      });
      localWs.on('close', (code: number, reason: Buffer) => {
        const reasonStr: string = reason.toString() || 'no reason provided';
        const codeDescription: string = getWebSocketCloseReason(code);
        logger.writeDebugLine(
          `Local client websocket closed - code: ${code} (${codeDescription}), reason: ${reasonStr}`
        );
        logger.writeDebugLine(
          `  Remote socket state: ${remoteSocket ? getWebSocketReadyStateString(remoteSocket.readyState) : 'undefined'}`
        );
        logger.writeDebugLine(`  handshakeAck: ${handshakeAck}`);
      });
      localWs.on('error', (err: Error) => {
        logger.writeErrorLine(`Local client websocket error: ${getNormalizedErrorString(err)}`);
      });
    });

    // Resolve immediately so caller can initiate local connection with query params (handshake completes later)
    resolve({
      remoteEndpoint: localProxyWsEndpoint,
      [Symbol.dispose]() {
        try {
          remoteWsServer.close();
        } catch {
          // ignore errors during remote WebSocket server shutdown
        }
        try {
          httpServer[Symbol.dispose]();
        } catch {
          // ignore errors during HTTP/WebSocket server shutdown
        }
      },
      // eslint-disable-next-line promise/param-names
      closePromise: new Promise<void>((resolve2) => {
        remoteWsServer.once('close', () => {
          resolve2();
        });
      })
    });
  });
}
