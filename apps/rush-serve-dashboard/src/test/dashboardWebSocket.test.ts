// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createDashboardWebSocketController } from '../modules/dashboardWebSocket';

const mockSockets: MockWebSocket[] = [];

class MockWebSocket extends EventTarget {
  public static readonly OPEN: number = 1;
  public readonly sent: string[] = [];
  public readonly url: string;
  public readyState: number = 0;
  public closed: boolean = false;

  public constructor(url: string) {
    super();
    this.url = url;
    mockSockets.push(this);
  }

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(): void {
    this.closed = true;
  }
}

describe('dashboard WebSocket controller', () => {
  const originalWebSocket: typeof WebSocket = globalThis.WebSocket;

  beforeEach(() => {
    mockSockets.length = 0;
    jest.useFakeTimers();
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.WebSocket = originalWebSocket;
  });

  it('connects, parses messages, sends commands, and reports lifecycle events', () => {
    const onConnectedStateChange = jest.fn();
    const onOpen = jest.fn();
    const onParsedMessage = jest.fn();
    const onParseError = jest.fn();
    const controller = createDashboardWebSocketController({
      getUrl: () => 'ws://localhost/ws',
      onConnecting: jest.fn(),
      onConnectedStateChange,
      onOpen,
      onClose: jest.fn(),
      onError: jest.fn(),
      onParsedMessage,
      onParseError,
      onLog: jest.fn()
    });

    controller.connect();
    const socket: MockWebSocket = mockSockets[0];
    socket.readyState = MockWebSocket.OPEN;
    socket.dispatchEvent(new Event('open'));
    socket.dispatchEvent(new MessageEvent('message', { data: '{"event":"sync"}' }));
    socket.dispatchEvent(new MessageEvent('message', { data: 'invalid' }));
    controller.sendCommand({ command: 'execute' });

    expect(controller.isConnected()).toBe(true);
    expect(onConnectedStateChange).toHaveBeenLastCalledWith(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onParsedMessage).toHaveBeenCalledWith({ event: 'sync' });
    expect(onParseError).toHaveBeenCalledTimes(1);
    expect(socket.sent).toEqual(['{"command":"execute"}']);
  });

  it('reconnects after an unexpected close but not after a manual disconnect', () => {
    const controller = createDashboardWebSocketController({
      getUrl: () => 'ws://localhost/ws',
      onConnecting: jest.fn(),
      onConnectedStateChange: jest.fn(),
      onOpen: jest.fn(),
      onClose: jest.fn(),
      onError: jest.fn(),
      onParsedMessage: jest.fn(),
      onParseError: jest.fn(),
      onLog: jest.fn()
    });

    controller.connect();
    mockSockets[0].dispatchEvent(new Event('close'));
    jest.advanceTimersByTime(4000);
    expect(mockSockets).toHaveLength(2);

    controller.disconnect();
    expect(mockSockets[1].closed).toBe(true);
    jest.advanceTimersByTime(4000);
    expect(mockSockets).toHaveLength(2);
  });
});
