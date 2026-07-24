// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable @rushstack/no-new-null */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ITopBarRefs {
  connectBtn: HTMLElement | null;
  statusPill: HTMLElement | null;
  statusEmojiEl: HTMLElement | null;
  debugBtn: HTMLElement | null;
  verboseBtn: HTMLElement | null;
  playPauseBtn: HTMLElement | null;
  parallelismInput: HTMLInputElement | null;
  managerStateEl: HTMLElement | null;
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

export function updateDerivedUrlDisplay(connectBtn: HTMLElement | null): void {
  if (!connectBtn) return;

  const url: string = computeWsUrl(window.location);
  connectBtn.title = 'Connect to WebSocket at ' + url;
  connectBtn.setAttribute('aria-label', 'Connect to WebSocket at ' + url);
}

export function showConnectingStatus(
  statusPill: HTMLElement | null,
  statusEmojiEl: HTMLElement | null,
  statusEmoji: (status: string) => string
): void {
  if (!statusPill || !statusEmojiEl) return;

  statusPill.className = 'status-pill status-Unspecified';
  statusEmojiEl.textContent = statusEmoji('Waiting');
  statusPill.textContent = overallStatusText('Connecting');
}

export function updateStatusPill(
  refs: ITopBarRefs,
  ws: WebSocket | null,
  graphSettings: any,
  statusEmoji: (status: string) => string
): void {
  if (!refs.statusPill || !refs.statusEmojiEl) return;

  let pillStatus: string = 'Disconnected';
  if (ws && ws.readyState === WebSocket.OPEN) {
    pillStatus = graphSettings?.status || 'Unspecified';
  }

  refs.statusPill.className = '';
  refs.statusPill.classList.add('status-pill', 'status-' + pillStatus);
  refs.statusEmojiEl.textContent = statusEmoji(pillStatus);
  refs.statusPill.textContent = overallStatusText(pillStatus);
}

export function setConnected(
  refs: ITopBarRefs,
  connected: boolean,
  updateSelectionUI: () => void,
  disabledControlIds: string[]
): void {
  const connectBtnEl: HTMLElement | null = refs.connectBtn;
  const iconSpan: HTMLElement | null = connectBtnEl
    ? (connectBtnEl.querySelector('span.codicon') as HTMLElement | null)
    : null;

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
    const el: HTMLButtonElement | HTMLInputElement | null = document.getElementById(id) as
      | HTMLButtonElement
      | HTMLInputElement
      | null;
    if (el) el.disabled = !connected;
  });

  updateSelectionUI();
}

export function updateManagerState(refs: ITopBarRefs, graphSettings: any): void {
  if (!graphSettings) return;

  const { debugBtn, verboseBtn, playPauseBtn, parallelismInput, managerStateEl } = refs;

  if (debugBtn) {
    if (graphSettings.debugMode) debugBtn.classList.add('active');
    else debugBtn.classList.remove('active');
    debugBtn.setAttribute('aria-pressed', graphSettings.debugMode ? 'true' : 'false');
    debugBtn.title = graphSettings.debugMode ? 'Turn off debug logging' : 'Turn on debug logging';
  }

  if (verboseBtn) {
    if (graphSettings.verbose) verboseBtn.classList.add('active');
    else verboseBtn.classList.remove('active');
    verboseBtn.setAttribute('aria-pressed', graphSettings.verbose ? 'true' : 'false');
    verboseBtn.title = graphSettings.verbose ? 'Turn off verbose logging' : 'Turn on verbose logging';
  }

  const ppIcon: HTMLElement | null = playPauseBtn
    ? (playPauseBtn.querySelector('.codicon') as HTMLElement | null)
    : null;
  if (playPauseBtn) {
    if (!graphSettings.pauseNextIteration) {
      playPauseBtn.classList.add('playing');
      playPauseBtn.setAttribute('aria-label', 'Switch to manual (pause)');
      playPauseBtn.title = 'Pause automatic iterations';
      if (ppIcon) {
        ppIcon.classList.remove('codicon-debug-start', 'codicon-debug-continue');
        ppIcon.classList.add('codicon-debug-pause');
      }
    } else {
      playPauseBtn.classList.remove('playing');
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

  const executeBtn: HTMLElement | null = document.getElementById('execute-btn');
  if (executeBtn) {
    if (graphSettings.hasScheduledIteration) {
      executeBtn.classList.add('queued');
      executeBtn.title = 'Run once (changes detected)';
      executeBtn.setAttribute('aria-label', 'Run once (changes detected)');
    } else {
      executeBtn.classList.remove('queued');
      executeBtn.title = 'Run once';
      executeBtn.setAttribute('aria-label', 'Run once');
    }
  }
}
