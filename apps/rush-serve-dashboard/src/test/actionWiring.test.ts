// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { wireLeftBarActions } from '../modules/leftBar';
import { wireMainBarActions } from '../modules/mainBar';
import { createSelectionBarController } from '../modules/selectionBar';
import {
  computeWsUrl,
  overallStatusText,
  setConnected,
  showConnectingStatus,
  updateManagerState,
  updateStatusPill,
  type ITopBarRefs
} from '../modules/topBar';

function click(id: string): void {
  document.getElementById(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('action wiring', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/dashboard');
  });

  it('wires selection commands and safe/unsafe enabled-state mode', () => {
    document.body.innerHTML = `
      <button id="invalidate-btn"></button><button id="close-runners-btn"></button>
      <button id="clear-selection-btn"></button><button id="expand-deps-btn"></button>
      <button id="expand-consumers-btn"></button><button id="set-enabled-default-btn"></button>
      <button id="set-enabled-ignore-deps-btn"></button><button id="set-enabled-disabled-btn"></button>
      <button id="selection-mode-btn"></button>`;
    const sendCommand = jest.fn();
    const clearSelectionAndRender = jest.fn();
    const expandSelectionDependencies = jest.fn();
    const expandSelectionConsumers = jest.fn();
    wireLeftBarActions({
      sendCommand,
      getSelection: () => new Set(['build']),
      clearSelectionAndRender,
      expandSelectionDependencies,
      expandSelectionConsumers
    });

    click('invalidate-btn');
    click('selection-mode-btn');
    click('set-enabled-disabled-btn');
    click('expand-deps-btn');
    click('expand-consumers-btn');
    click('clear-selection-btn');

    expect(sendCommand).toHaveBeenNthCalledWith(1, { command: 'invalidate', operationNames: ['build'] });
    expect(sendCommand).toHaveBeenNthCalledWith(2, {
      command: 'set-enabled-states',
      operationNames: ['build'],
      targetState: 'never',
      mode: 'unsafe'
    });
    expect(expandSelectionDependencies).toHaveBeenCalledTimes(1);
    expect(expandSelectionConsumers).toHaveBeenCalledTimes(1);
    expect(clearSelectionAndRender).toHaveBeenCalledTimes(1);
  });

  it('wires manager commands and keyboard selection', () => {
    document.body.innerHTML =
      '<button id="connect-btn"></button><button id="execute-btn"></button><button id="abort-execution-btn"></button>';
    const debugBtn: HTMLButtonElement = document.createElement('button');
    const verboseBtn: HTMLButtonElement = document.createElement('button');
    const parallelismInput: HTMLInputElement = document.createElement('input');
    const playPauseBtn: HTMLButtonElement = document.createElement('button');
    const sendCommand = jest.fn();
    const connect = jest.fn();
    const setSelection = jest.fn();
    const clearSelection = jest.fn();
    const render = jest.fn();
    parallelismInput.value = '4';

    wireMainBarActions({
      connect,
      disconnect: jest.fn(),
      isConnected: () => false,
      sendCommand,
      getGraphSettings: () => ({ debugMode: false, verbose: true, pauseNextIteration: false }),
      debugBtn,
      verboseBtn,
      parallelismInput,
      playPauseBtn,
      getOperationNames: () => ['build', 'test'],
      setSelection,
      clearSelection,
      hasSelection: () => true,
      render
    });

    click('connect-btn');
    click('execute-btn');
    debugBtn.click();
    verboseBtn.click();
    parallelismInput.dispatchEvent(new Event('change'));
    playPauseBtn.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(connect).toHaveBeenCalledTimes(1);
    expect(sendCommand.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      { command: 'execute' },
      { command: 'set-debug', value: true },
      { command: 'set-verbose', value: false },
      { command: 'set-parallelism', parallelism: 4 },
      { command: 'set-pause-next-iteration', value: true }
    ]);
    expect(setSelection).toHaveBeenCalledWith(new Set(['build', 'test']));
    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(2);
  });
});

describe('top and selection bars', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="connect-btn"><span class="codicon"></span></button>
      <span id="status-pill"></span><span id="status-emoji"></span>
      <button id="debug-btn"></button><button id="verbose-btn"></button>
      <button id="play-pause-btn"><span class="codicon"></span></button>
      <input id="parallelism"><span id="manager-state"></span><button id="execute-btn"></button>
      <div id="selection-bar"></div><span id="view-heading-text"></span><span id="selection-count"></span>
      <button id="invalidate-btn"></button><button id="clear-selection-btn"></button>`;
  });

  function getRefs(): ITopBarRefs {
    return {
      connectBtn: document.getElementById('connect-btn') ?? undefined,
      statusPill: document.getElementById('status-pill') ?? undefined,
      statusEmojiEl: document.getElementById('status-emoji') ?? undefined,
      debugBtn: document.getElementById('debug-btn') ?? undefined,
      verboseBtn: document.getElementById('verbose-btn') ?? undefined,
      playPauseBtn: document.getElementById('play-pause-btn') ?? undefined,
      parallelismInput: (document.getElementById('parallelism') as HTMLInputElement) ?? undefined,
      managerStateEl: document.getElementById('manager-state') ?? undefined
    };
  }

  it('formats URLs and updates connection and status state', () => {
    const refs: ITopBarRefs = getRefs();
    expect(computeWsUrl({ host: 'example.test', protocol: 'https:' } as Location)).toBe(
      'wss://example.test/ws'
    );
    expect(overallStatusText('SuccessWithWarning')).toBe('WARNING');

    showConnectingStatus(refs.statusPill, refs.statusEmojiEl, () => 'waiting');
    expect(refs.statusPill?.textContent).toBe('CONNECTING');
    const socket: WebSocket = { readyState: WebSocket.OPEN } as WebSocket;
    updateStatusPill(refs, socket, { status: 'Success' }, () => 'success');
    expect(refs.statusPill?.classList.contains('status-Success')).toBe(true);

    const updateSelectionUI = jest.fn();
    setConnected(refs, true, updateSelectionUI, ['execute-btn']);
    expect(refs.connectBtn?.dataset.state).toBe('connected');
    expect((document.getElementById('execute-btn') as HTMLButtonElement).disabled).toBe(false);
    expect(updateSelectionUI).toHaveBeenCalledTimes(1);
  });

  it('updates manager and selection controls', () => {
    const refs: ITopBarRefs = getRefs();
    updateManagerState(refs, {
      debugMode: true,
      verbose: false,
      pauseNextIteration: true,
      parallelism: 8,
      hasScheduledIteration: true
    });
    expect(refs.debugBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(refs.playPauseBtn?.title).toBe('Resume automatic iterations');
    expect(refs.parallelismInput?.value).toBe('8');
    expect(document.getElementById('execute-btn')?.classList.contains('queued')).toBe(true);

    const controller = createSelectionBarController({
      getSelection: () => new Set(['build']),
      getCurrentView: () => 'graph',
      isConnected: () => true
    });
    controller.updateSelectionUI();
    expect(document.getElementById('view-heading-text')?.textContent).toBe('Dependency Graph');
    expect(document.getElementById('selection-count')?.textContent).toBe('1 selected');
    expect((document.getElementById('invalidate-btn') as HTMLButtonElement).disabled).toBe(false);
  });
});
