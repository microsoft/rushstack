// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface ILeftBarActionWiringOptions {
  sendCommand: (cmd: {
    command: string;
    operationNames?: string[];
    targetState?: string;
    mode?: string;
  }) => void;
  getSelection: () => Set<string>;
  clearSelectionAndRender: () => void;
  expandSelectionDependencies: () => void;
  expandSelectionConsumers: () => void;
}

export function wireLeftBarActions(options: ILeftBarActionWiringOptions): void {
  const {
    sendCommand,
    getSelection,
    clearSelectionAndRender,
    expandSelectionDependencies,
    expandSelectionConsumers
  } = options;

  const invalidateBtn: HTMLElement | null = document.getElementById('invalidate-btn');
  const closeRunnersBtn: HTMLElement | null = document.getElementById('close-runners-btn');
  const clearSelectionBtn: HTMLElement | null = document.getElementById('clear-selection-btn');
  const expandDepsBtn: HTMLElement | null = document.getElementById('expand-deps-btn');
  const expandConsumersBtn: HTMLElement | null = document.getElementById('expand-consumers-btn');
  const setEnabledDefaultBtn: HTMLElement | null = document.getElementById('set-enabled-default-btn');
  const setEnabledIgnoreDepsBtn: HTMLElement | null = document.getElementById('set-enabled-ignore-deps-btn');
  const setEnabledDisabledBtn: HTMLElement | null = document.getElementById('set-enabled-disabled-btn');
  const selectionModeBtn: HTMLElement | null = document.getElementById('selection-mode-btn');

  if (invalidateBtn) {
    invalidateBtn.addEventListener('click', () => {
      sendCommand({ command: 'invalidate', operationNames: Array.from(getSelection()) });
    });
  }

  if (closeRunnersBtn) {
    closeRunnersBtn.addEventListener('click', () => {
      sendCommand({ command: 'close-runners', operationNames: Array.from(getSelection()) });
    });
  }

  if (expandDepsBtn) {
    expandDepsBtn.addEventListener('click', expandSelectionDependencies);
  }

  if (expandConsumersBtn) {
    expandConsumersBtn.addEventListener('click', expandSelectionConsumers);
  }

  let selectionEnableMode: 'safe' | 'unsafe' = 'safe';
  if (selectionModeBtn) {
    selectionModeBtn.addEventListener('click', () => {
      selectionEnableMode = selectionEnableMode === 'safe' ? 'unsafe' : 'safe';
      selectionModeBtn.dataset.mode = selectionEnableMode;
      selectionModeBtn.textContent = `Mode: ${selectionEnableMode[0].toUpperCase()}${selectionEnableMode.slice(1)}`;
      selectionModeBtn.title =
        selectionEnableMode === 'safe'
          ? 'Currently Safe mode (dependency aware). Click to switch to Unsafe.'
          : 'Currently Unsafe mode (direct mutation). Click to switch to Safe.';
    });
  }

  const sendEnableState = (targetState: 'affected' | 'ignore-dependency-changes' | 'never'): void => {
    const selection: Set<string> = getSelection();
    if (!selection.size) return;

    sendCommand({
      command: 'set-enabled-states',
      operationNames: Array.from(selection),
      targetState,
      mode: selectionEnableMode
    });
  };

  if (setEnabledDefaultBtn) {
    setEnabledDefaultBtn.addEventListener('click', () => sendEnableState('affected'));
  }

  if (setEnabledIgnoreDepsBtn) {
    setEnabledIgnoreDepsBtn.addEventListener('click', () => sendEnableState('ignore-dependency-changes'));
  }

  if (setEnabledDisabledBtn) {
    setEnabledDisabledBtn.addEventListener('click', () => sendEnableState('never'));
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', clearSelectionAndRender);
  }
}
