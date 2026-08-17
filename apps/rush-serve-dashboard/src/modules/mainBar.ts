// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IMainBarActionWiringOptions {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
  sendCommand: (cmd: { command: string; value?: boolean; parallelism?: number }) => void;
  getGraphSettings: () =>
    | { debugMode?: boolean; verbose?: boolean; pauseNextIteration?: boolean }
    | undefined;
  debugBtn: HTMLElement | undefined;
  verboseBtn: HTMLElement | undefined;
  parallelismInput: HTMLInputElement | undefined;
  playPauseBtn: HTMLElement | undefined;
  getOperationNames: () => string[];
  setSelection: (next: Set<string>) => void;
  clearSelection: () => void;
  hasSelection: () => boolean;
  render: () => void;
}

function isTextEditingTarget(target: EventTarget | undefined): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
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

  const connectBtn: HTMLElement | undefined = document.getElementById('connect-btn') ?? undefined;
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      if (isConnected()) {
        disconnect();
      } else {
        connect();
      }
    });
  }

  const executeBtn: HTMLElement | undefined = document.getElementById('execute-btn') ?? undefined;
  if (executeBtn) {
    executeBtn.addEventListener('click', () => sendCommand({ command: 'execute' }));
  }

  const abortBtn: HTMLElement | undefined = document.getElementById('abort-execution-btn') ?? undefined;
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
      const value: number = Number(parallelismInput.value) || 1;
      sendCommand({ command: 'set-parallelism', parallelism: value });
    });
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      const graphSettings:
        | { debugMode?: boolean; verbose?: boolean; pauseNextIteration?: boolean }
        | undefined = getGraphSettings();
      if (!graphSettings) return;
      const next: boolean = !!graphSettings.pauseNextIteration;
      sendCommand({ command: 'set-pause-next-iteration', value: !next });
    });
  }

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'a' && (e.metaKey || e.ctrlKey) && !isTextEditingTarget(e.target ?? undefined)) {
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
