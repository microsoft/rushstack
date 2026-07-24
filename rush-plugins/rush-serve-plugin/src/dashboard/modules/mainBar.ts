// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable @rushstack/no-new-null */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/typedef */

export interface IMainBarActionWiringOptions {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
  sendCommand: (cmd: any) => void;
  getGraphSettings: () => any;
  debugBtn: HTMLElement | null;
  verboseBtn: HTMLElement | null;
  parallelismInput: HTMLInputElement | null;
  playPauseBtn: HTMLElement | null;
  getOperationNames: () => string[];
  setSelection: (next: Set<string>) => void;
  clearSelection: () => void;
  hasSelection: () => boolean;
  render: () => void;
}

export function wireMainBarActions(options: IMainBarActionWiringOptions): void {
  const {
    connect,
    disconnect,
    isConnected,
    sendCommand,
    getGraphSettings,
    debugBtn,
    verboseBtn,
    parallelismInput,
    playPauseBtn,
    getOperationNames,
    setSelection,
    clearSelection,
    hasSelection,
    render
  } = options;

  const connectBtn: HTMLElement | null = document.getElementById('connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      if (isConnected()) {
        disconnect();
      } else {
        connect();
      }
    });
  }

  const executeBtn: HTMLElement | null = document.getElementById('execute-btn');
  if (executeBtn) {
    executeBtn.addEventListener('click', () => sendCommand({ command: 'execute' }));
  }

  const abortBtn: HTMLElement | null = document.getElementById('abort-execution-btn');
  if (abortBtn) {
    abortBtn.addEventListener('click', () => sendCommand({ command: 'abort-execution' }));
  }

  if (debugBtn) {
    debugBtn.addEventListener('click', () => {
      const newVal: boolean = !getGraphSettings()?.debugMode;
      debugBtn.title = newVal ? 'Turn off debug logging' : 'Turn on debug logging';
      sendCommand({ command: 'set-debug', value: newVal });
    });
  }

  if (verboseBtn) {
    verboseBtn.addEventListener('click', () => {
      const newVal: boolean = !getGraphSettings()?.verbose;
      verboseBtn.title = newVal ? 'Turn off verbose logging' : 'Turn on verbose logging';
      sendCommand({ command: 'set-verbose', value: newVal });
    });
  }

  if (parallelismInput) {
    parallelismInput.addEventListener('change', () => {
      sendCommand({ command: 'set-parallelism', parallelism: Number(parallelismInput.value) || 1 });
    });
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      const graphSettings = getGraphSettings();
      if (!graphSettings) return;
      const next: boolean = !!graphSettings.pauseNextIteration;
      sendCommand({ command: 'set-pause-next-iteration', value: !next });
    });
  }

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setSelection(new Set(getOperationNames()));
      render();
    }

    if (e.key === 'Escape' && hasSelection()) {
      clearSelection();
      render();
    }
  });
}
