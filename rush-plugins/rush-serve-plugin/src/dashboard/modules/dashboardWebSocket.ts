// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IDashboardWebSocketControllerOptions {
  getUrl: () => string;
  onConnecting: (url: string) => void;
  onConnectedStateChange: (connected: boolean) => void;
  onOpen: () => void;
  onClose: () => void;
  onError: (event: Event) => void;
  onParsedMessage: (message: unknown) => void;
  onParseError: (error: unknown) => void;
  onLog: (message: string) => void;
}

export interface IDashboardWebSocketController {
  connect: () => void;
  disconnect: () => void;
  sendCommand: (command: unknown) => void;
  isConnected: () => boolean;
  getSocket: () => WebSocket | undefined;
}

export function createDashboardWebSocketController(
  options: IDashboardWebSocketControllerOptions
): IDashboardWebSocketController {
  let ws: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let manualDisconnect: boolean = false;

  const isConnected = (): boolean => !!ws && ws.readyState === WebSocket.OPEN;
  const getSocket = (): WebSocket | undefined => ws;

  const scheduleReconnect = (): void => {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      if (!manualDisconnect) connect();
    }, 4000);
  };

  function connect(): void {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }

    manualDisconnect = false;
    const url: string = options.getUrl();
    if (!url) return;

    options.onConnecting(url);
    options.onLog('Attempting connection to ' + url);

    try {
      ws = new WebSocket(url);
    } catch (error: unknown) {
      options.onLog('WebSocket creation failed: ' + String(error));
      scheduleReconnect();
      return;
    }

    options.onConnectedStateChange(false);

    ws.addEventListener('open', () => {
      options.onLog('Connected');
      options.onConnectedStateChange(true);
      options.onOpen();
    });

    ws.addEventListener('close', () => {
      options.onLog('Disconnected');
      options.onConnectedStateChange(false);
      ws = undefined;
      options.onClose();
      if (!manualDisconnect) scheduleReconnect();
    });

    ws.addEventListener('error', (event: Event) => {
      options.onError(event);
    });

    ws.addEventListener('message', (ev: MessageEvent<string>) => {
      try {
        options.onParsedMessage(JSON.parse(ev.data));
      } catch (error: unknown) {
        options.onParseError(error);
      }
    });
  }

  const disconnect = (): void => {
    manualDisconnect = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore close failures
      }
      ws = undefined;
    }
  };

  const sendCommand = (command: unknown): void => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(command));
    }
  };

  return {
    connect,
    disconnect,
    sendCommand,
    isConnected,
    getSocket
  };
}
