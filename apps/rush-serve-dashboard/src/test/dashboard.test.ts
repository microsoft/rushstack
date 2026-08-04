// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const sockets: MockWebSocket[] = [];

class MockWebSocket extends EventTarget {
  public static readonly OPEN: number = 1;
  public readyState: number = 0;

  public constructor() {
    super();
    sockets.push(this);
  }

  public send(): void {}
  public close(): void {}
}

describe('dashboard entrypoint', () => {
  const originalWebSocket: typeof WebSocket = globalThis.WebSocket;

  beforeEach(() => {
    jest.resetModules();
    sockets.length = 0;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    window.history.replaceState(null, '', '/dashboard');
    document.body.innerHTML = `
      <span id="status-pill"></span><span id="status-emoji"></span><button id="connect-btn"><span class="codicon"></span></button>
      <span id="app-title"></span><table id="operations-table"><thead></thead><tbody></tbody></table><span id="table-stats"></span>
      <span id="graph-state"></span><button id="play-pause-btn"></button><input id="parallelism-input">
      <button id="debug-btn"></button><button id="verbose-btn"></button>
      <div id="graph"><svg id="edges"></svg></div><div id="graph-legend"></div>
      <div id="phase-pane"><div id="phase-groups"></div></div>
      <div id="terminal"><div id="terminal-body"></div></div><button id="term-clear-btn"></button>
      <input id="term-autoscroll" type="checkbox" checked><button id="term-autoscroll-btn"></button>
      <button id="toggle-terminal-btn"></button><div id="resizer"></div>
      <div id="selection-bar"></div><span id="view-heading-text"></span><span id="selection-count"></span>
      <div id="left"></div><div id="right"></div>
      <input type="radio" name="view" value="table"><input type="radio" name="view" value="graph">
      <select id="filter-select"><option value="all">All</option></select><input id="name-search">`;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it('connects and renders a synchronization message', async () => {
    const consoleSpy = jest.spyOn(window.console, 'log').mockImplementation(() => {});
    await import('../dashboard');
    const socket: MockWebSocket = sockets[0];
    socket.readyState = MockWebSocket.OPEN;
    socket.dispatchEvent(new Event('open'));
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          event: 'sync',
          operations: [{ name: 'package-a (build)', packageName: 'package-a', phaseName: '_phase:build' }],
          currentExecutionStates: [{ name: 'package-a (build)', status: 'Success' }],
          graphState: { status: 'Success', parallelism: 2 },
          sessionInfo: { actionName: 'start', repositoryIdentifier: 'rushstack' }
        })
      })
    );

    expect(document.title).toBe('start — rushstack');
    expect(document.getElementById('table-stats')?.textContent).toBe('1 operations');
    expect(document.querySelector('#operations-table tbody')?.textContent).toContain('package-a');
    expect(document.getElementById('status-pill')?.textContent).toBe('SUCCESS');
    consoleSpy.mockRestore();
  });
});
