// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import globalStyles from '../styles/global.module.css';
import topBarStyles from '../styles/topBar.module.css';
import { getStatusClassName } from './statusHelpers';

export interface ITopBarRefs {
  connectBtn: HTMLElement | undefined;
  statusPill: HTMLElement | undefined;
  statusEmojiEl: HTMLElement | undefined;
  debugBtn: HTMLElement | undefined;
  verboseBtn: HTMLElement | undefined;
  playPauseBtn: HTMLElement | undefined;
  parallelismInput: HTMLInputElement | undefined;
  managerStateEl: HTMLElement | undefined;
}

export interface ITopBarGraphState {
  status?: string;
  debugMode?: boolean;
  verbose?: boolean;
  pauseNextIteration?: boolean;
  parallelism?: number | string;
  hasScheduledIteration?: boolean;
}

export function overallStatusText(status: string | undefined): string {
  if (!status) return '';

  switch (status) {
    case 'SuccessWithWarning':
      return 'WARNING';
    case 'FromCache':
      return 'CACHED';
    case 'NoOp':
      return 'NO-OP';
    case 'Disconnected':
      return 'DISCONNECTED';
    case 'Connecting':
      return 'CONNECTING';
    case 'Connected':
      return 'CONNECTED';
    case 'Unknown':
      return 'UNKNOWN';
    default:
      return String(status).toUpperCase();
  }
}

export function computeWsUrl(loc: Location): string {
  if (!loc || !loc.host) {
    return 'ws://localhost:9001/';
  }

  const proto: string = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return proto + '//' + loc.host + '/ws';
}

export function updateDerivedUrlDisplay(connectBtn: HTMLElement | undefined): void {
  if (!connectBtn) return;

  const url: string = computeWsUrl(window.location);
  connectBtn.title = 'Connect to WebSocket at ' + url;
  connectBtn.setAttribute('aria-label', 'Connect to WebSocket at ' + url);
}

export function showConnectingStatus(
  statusPill: HTMLElement | undefined,
  statusEmojiEl: HTMLElement | undefined,
  statusEmoji: (status: string) => string
): void {
  if (!statusPill || !statusEmojiEl) return;

  statusPill.className = `${globalStyles.statusPill} ${topBarStyles.statusPill} ${getStatusClassName('Unspecified')}`;
  statusEmojiEl.textContent = statusEmoji('Waiting');
  statusPill.textContent = overallStatusText('Connecting');
}

export function updateStatusPill(
  refs: ITopBarRefs,
  ws: WebSocket | undefined,
  graphSettings: ITopBarGraphState | undefined,
  statusEmoji: (status: string) => string
): void {
  if (!refs.statusPill || !refs.statusEmojiEl) return;

  let pillStatus: string = 'Disconnected';
  if (ws && ws.readyState === WebSocket.OPEN) {
    pillStatus = graphSettings?.status || 'Unspecified';
  }

  refs.statusPill.className = `${globalStyles.statusPill} ${topBarStyles.statusPill} ${getStatusClassName(pillStatus)}`;
  refs.statusEmojiEl.textContent = statusEmoji(pillStatus);
  refs.statusPill.textContent = overallStatusText(pillStatus);
}

export function setConnected(
  refs: ITopBarRefs,
  connected: boolean,
  updateSelectionUI: () => void,
  disabledControlIds: string[]
): void {
  const connectBtnEl: HTMLElement | undefined = refs.connectBtn;
  const iconSpan: HTMLElement | undefined =
    (connectBtnEl?.querySelector('span.codicon') as HTMLElement | null) ?? undefined;

  if (connectBtnEl) {
    if (connected) {
      if (iconSpan) iconSpan.className = 'codicon codicon-debug-disconnect';
      connectBtnEl.setAttribute('data-state', 'connected');
      connectBtnEl.title = 'Disconnect WebSocket';
      connectBtnEl.setAttribute('aria-label', 'Disconnect WebSocket');
    } else {
      if (iconSpan) iconSpan.className = 'codicon codicon-plug';
      connectBtnEl.setAttribute('data-state', 'disconnected');
      connectBtnEl.title = 'Connect to WebSocket';
      connectBtnEl.setAttribute('aria-label', 'Connect to WebSocket');
      updateDerivedUrlDisplay(connectBtnEl);
    }
  }

  disabledControlIds.forEach((id) => {
    const el: HTMLButtonElement | HTMLInputElement | undefined =
      (document.getElementById(id) as HTMLButtonElement | HTMLInputElement | null) ?? undefined;
    if (el) el.disabled = !connected;
  });

  updateSelectionUI();
}

export function updateManagerState(refs: ITopBarRefs, graphSettings: ITopBarGraphState): void {
  if (!graphSettings) return;

  const { debugBtn, verboseBtn, playPauseBtn, parallelismInput, managerStateEl } = refs;

  if (debugBtn) {
    if (graphSettings.debugMode) debugBtn.classList.add(globalStyles.active);
    else debugBtn.classList.remove(globalStyles.active);
    debugBtn.setAttribute('aria-pressed', graphSettings.debugMode ? 'true' : 'false');
    debugBtn.title = graphSettings.debugMode ? 'Turn off debug logging' : 'Turn on debug logging';
  }

  if (verboseBtn) {
    if (graphSettings.verbose) verboseBtn.classList.add(globalStyles.active);
    else verboseBtn.classList.remove(globalStyles.active);
    verboseBtn.setAttribute('aria-pressed', graphSettings.verbose ? 'true' : 'false');
    verboseBtn.title = graphSettings.verbose ? 'Turn off verbose logging' : 'Turn on verbose logging';
  }

  const ppIcon: HTMLElement | undefined =
    (playPauseBtn?.querySelector('.codicon') as HTMLElement | null) ?? undefined;
  if (playPauseBtn) {
    if (!graphSettings.pauseNextIteration) {
      playPauseBtn.classList.add(globalStyles.playing);
      playPauseBtn.setAttribute('aria-label', 'Switch to manual (pause)');
      playPauseBtn.title = 'Pause automatic iterations';
      if (ppIcon) {
        ppIcon.classList.remove('codicon-debug-start', 'codicon-debug-continue');
        ppIcon.classList.add('codicon-debug-pause');
      }
    } else {
      playPauseBtn.classList.remove(globalStyles.playing);
      playPauseBtn.setAttribute('aria-label', 'Switch to automatic (play)');
      playPauseBtn.title = 'Resume automatic iterations';
      if (ppIcon) {
        ppIcon.classList.remove('codicon-debug-pause');
        ppIcon.classList.add('codicon-debug-start');
      }
    }
  }

  if (parallelismInput) {
    parallelismInput.value = String(graphSettings.parallelism ?? '');
  }

  if (managerStateEl) {
    managerStateEl.innerHTML = '';
  }

  const executeBtn: HTMLElement | undefined = document.getElementById('execute-btn') ?? undefined;
  if (executeBtn) {
    if (graphSettings.hasScheduledIteration) {
      executeBtn.classList.add(globalStyles.queued);
      executeBtn.title = 'Run once (changes detected)';
      executeBtn.setAttribute('aria-label', 'Run once (changes detected)');
    } else {
      executeBtn.classList.remove(globalStyles.queued);
      executeBtn.title = 'Run once';
      executeBtn.setAttribute('aria-label', 'Run once');
    }
  }
}
