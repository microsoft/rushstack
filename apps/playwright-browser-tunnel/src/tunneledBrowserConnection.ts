// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import playwright from 'playwright-core';
import type { Browser, LaunchOptions } from 'playwright-core';
import { type AddressInfo, WebSocketServer, WebSocket } from 'ws';
import playwrightPackageJson from 'playwright-core/package.json';

const { version: playwrightVersion } = playwrightPackageJson;

export type BrowserNames = 'chromium' | 'firefox' | 'webkit';

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

export async function tunneledBrowserConnection(
  browserName: BrowserNames,
  launchOptions: LaunchOptions
): Promise<{ browser: Browser; [Symbol.dispose]: () => void }> {
  return new Promise((resolve) => {
    const wsServer: WebSocketServer = new WebSocketServer({ port: LISTEN_PORT });
    const localProxyWs: WebSocketServer = new WebSocketServer({ port: 0 });
    const localProxyWsEndpoint: string = `ws://localhost:${(localProxyWs.address() as AddressInfo).port}`;

    const handshake: IHandshake = {
      action: 'handshake',
      browserName,
      launchOptions,
      playwrightVersion
    };
    let handshakeAck: boolean = false;
    let browser: Browser | undefined = undefined;

    wsServer.on('listening', () => {
      console.log(`WebSocket server is listening on endpoint ws://localhost:${LISTEN_PORT}`);
    });

    wsServer.on('close', () => {
      console.log('WebSocket server closed');
    });
    wsServer.on('error', (error) => {
      console.error(`WebSocket server error: ${error}`);
    });
    wsServer.on('connection', async (ws) => {
      console.log('New WebSocket connection established');
      handshakeAck = false;
      ws.send(JSON.stringify(handshake));

      ws.on('message', async (message) => {
        if (!handshakeAck) {
          try {
            const receivedHandshake: IHandshakeAck = JSON.parse(message.toString());
            if (receivedHandshake.action === 'handshakeAck') {
              handshakeAck = true;
              localProxyWs.on('connection', (localWs) => {
                localWs.on('message', (localMessage) => {
                  ws.send(localMessage);
                });
              });
              browser = await playwright[browserName].connect(localProxyWsEndpoint);
              console.log(`Browser connected to local proxy.`);
              resolve({
                browser,
                [Symbol.dispose]() {
                  console.log('Disposing browser and closing WebSocket connections');
                  wsServer.close();
                }
              });
            } else {
              console.error('Invalid handshake received');
              ws.close();
              return;
            }
          } catch (error) {
            console.error(`Error parsing handshake message: ${error}`);
            ws.close();
            return;
          }
        } else {
          localProxyWs.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(message);
            }
          });
        }
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error: ${error}`);
      });
    });
  });
}
