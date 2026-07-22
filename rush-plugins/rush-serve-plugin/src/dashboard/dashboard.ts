// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// @ts-nocheck

// Removed in-page log panel; logging now goes directly to devtools console
const statusPill = document.getElementById('status-pill');
const statusEmojiEl = document.getElementById('status-emoji');
const connectBtn = document.getElementById('connect-btn');
const appTitleEl = document.getElementById('app-title');
const tableEl = document.getElementById('operations-table');
const tableHead = tableEl.querySelector('thead');
const tableBody = tableEl.querySelector('tbody');
const tableStats = document.getElementById('table-stats');
const managerStateEl = document.getElementById('graph-state');
const edgesSvg = document.getElementById('edges');
const graphEl = document.getElementById('graph');
const legendEl = document.getElementById('graph-legend');
const phasePaneEl = document.getElementById('phase-pane');
const phaseGroupsEl = phasePaneEl ? phasePaneEl.querySelector('.phase-groups') : null;
const playPauseBtn = document.getElementById('play-pause-btn');
const parallelismInput = document.getElementById('parallelism-input');
const debugBtn = document.getElementById('debug-btn');
const verboseBtn = document.getElementById('verbose-btn');
const selectVisibleBtn = document.getElementById('select-visible-btn');
// Terminal elements
const terminalEl = document.getElementById('terminal');
const terminalBody = document.getElementById('terminal-body');
const termClearBtn = document.getElementById('term-clear-btn');
const termAutoScroll = document.getElementById('term-autoscroll');
// Terminal styling state parsed from VT SGR sequences. We'll maintain a stack-like currentState object
const ansiState = {
  bold: false,
  underline: false,
  inverse: false,
  fg: null, // CSS color string or null
  bg: null
};

// Basic SGR parser: handles ESC [ ... m sequences. Returns array of SGR numeric params.
function parseSgrParams(seq) {
  // seq expected like '\u001b[31;1m' or '31;1'
  const s = seq.replace(/^\x1b\[|m$/g, '');
  if (!s) return [0];
  return s.split(';').map((p) => Number(p || 0));
}

// Map common SGR codes to actions that mutate ansiState. We only support common color codes and attributes.
function applySgr(params) {
  if (!params || !params.length) params = [0];
  for (const p of params) {
    if (p === 0) {
      ansiState.bold = false;
      ansiState.underline = false;
      ansiState.inverse = false;
      ansiState.fg = null;
      ansiState.bg = null;
    } else if (p === 1) {
      ansiState.bold = true;
    } else if (p === 4) {
      ansiState.underline = true;
    } else if (p === 7) {
      ansiState.inverse = true;
    } else if (p === 22) {
      ansiState.bold = false;
    } else if (p === 24) {
      ansiState.underline = false;
    } else if (p >= 30 && p <= 37) {
      ansiState.fg = sgrColorToCss(p - 30, false);
    } else if (p === 39) {
      ansiState.fg = null;
    } else if (p >= 40 && p <= 47) {
      ansiState.bg = sgrColorToCss(p - 40, false);
    } else if (p === 49) {
      ansiState.bg = null;
    } else if (p >= 90 && p <= 97) {
      ansiState.fg = sgrColorToCss(p - 90, true);
    } else if (p >= 100 && p <= 107) {
      ansiState.bg = sgrColorToCss(p - 100, true);
    } else {
      // ignore other codes (including 38/48 extended color sequences for now)
    }
  }
}

function sgrColorToCss(idx, bright) {
  // Map 0..7 to CSS colors roughly matching common terminal palette
  const base = [
    '#000000', // black
    '#a00', // red
    '#0a0', // green
    '#aa0', // yellow
    '#00a', // blue
    '#a0a', // magenta
    '#0aa', // cyan
    '#ddd' // white / light gray
  ];
  const brightMap = ['#555', '#ff5555', '#55ff55', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#fff'];
  return bright ? brightMap[idx] || base[idx] : base[idx] || null;
}

// Process ANSI control sequences (CSI sequences) and update ansiState for SGRs.
// Returns an array of segments: { text: string, style: string } where style is the
// inline style corresponding to the SGR state that applies to that text.
// If the chunk contains no control codes, exactly one segment is returned using
// the current ansiState. Control codes are not included in returned text.
function processAnsiToSegments(s) {
  const ESC = '\x1b';
  const csiRegex = new RegExp(ESC + '\\[[0-9;]*m', 'g');
  let match;
  let lastIndex = 0;
  const segments = [];
  // Helper to snapshot current state and produce style
  function pushSegmentIfText(text) {
    if (text == null || text.length === 0) return;
    // Snapshot current ansiState
    const snap = {
      fg: ansiState.fg,
      bg: ansiState.bg,
      bold: ansiState.bold,
      underline: ansiState.underline,
      inverse: ansiState.inverse
    };
    const style = ansiStateToStyle(snap);
    segments.push({ text, style });
  }
  while ((match = csiRegex.exec(s)) !== null) {
    const idx = match.index;
    // text before the control sequence keeps the current style
    if (idx > lastIndex) pushSegmentIfText(s.slice(lastIndex, idx));
    const seq = match[0];
    try {
      const params = parseSgrParams(seq);
      applySgr(params);
    } catch (e) {}
    lastIndex = csiRegex.lastIndex;
  }
  if (lastIndex < s.length) pushSegmentIfText(s.slice(lastIndex));
  // If there were no control codes and we produced no segments (empty input), still
  // ensure we return a single empty segment? It's better to return empty array so caller can skip.
  return segments;
}

// Convert current ansiState to inline style map
function ansiStateToStyle(state) {
  const styles = [];
  if (state.fg) styles.push('color: ' + state.fg);
  if (state.bg) styles.push('background-color: ' + state.bg);
  if (state.bold) styles.push('font-weight: 700');
  if (state.underline) styles.push('text-decoration: underline');
  if (state.inverse) styles.push('filter: invert(100%)');
  return styles.join('; ');
}

// NOTE: main margin adjustments are removed; layout is flex-based and will reflow automatically.
let ws = null;
// Static graph definition (IOperationInfo)
let operations = new Map(); // name -> IOperationInfo
// Dynamic execution state (IOperationExecutionState) keyed by name
let executionStates = new Map();
// Queued states for next iteration (IOperationExecutionState) keyed by name
let queuedStates = new Map();
let selection = new Set();
let sortKey = 'status';
let sortDir = 1; // 1 asc, -1 desc
let graphSettings = null;
// Stores last execution results (previous iteration) keyed by name
let lastExecutionResults = new Map();
const enabledStateDisplay = {
  never: 'never',
  'ignore-dependency-changes': 'ignore deps',
  affected: 'affected'
};
// Table multi-select support
let tableOpOrder = []; // linear order of operations as rendered (for shift range)
let lastTableAnchorName = null; // anchor operation name
let lastTableAnchorCoord = null; // {row, phase}
let lastTablePhases = [];
let lastTablePackages = []; // array of { packageName, byPhase }
// Reconnect management
const RECONNECT_INTERVAL_MS = 4000;
let reconnectTimer = null;
let manualDisconnect = false;

function log(msg) {
  const time = new Date().toLocaleTimeString();
  // eslint-disable-next-line no-console
  console.log('[' + time + '] ' + msg);
}

function setConnected(connected) {
  const connectBtnEl = document.getElementById('connect-btn');
  const iconSpan = connectBtnEl.querySelector('span.codicon');
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
    updateDerivedUrlDisplay();
  }
  [
    'invalidate-btn',
    'close-runners-btn',
    'set-enabled-default-btn',
    'set-enabled-ignore-deps-btn',
    'set-enabled-disabled-btn',
    'expand-deps-btn',
    'expand-consumers-btn',
    'execute-btn',
    'abort-execution-btn',
    'clear-selection-btn',
    'debug-btn',
    'verbose-btn',
    'parallelism-input',
    'play-pause-btn'
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !connected;
  });
  updateSelectionUI();
}

if (selectVisibleBtn) {
  selectVisibleBtn.addEventListener('click', () => {
    for (const op of operations.values()) {
      if (!filteredOutNames.has(op.name) && !searchFilteredOutNames.has(op.name)) {
        selection.add(op.name);
      }
    }
    updateSelectionUI();
    updateGraph();
    updateTable();
  });
}

// Restored: central place to update UI state dependent on graphSettings
function updateManagerState() {
  if (!graphSettings) return;
  // Sync debug / verbose toggle button states
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
  // Update play/pause visual state
  const ppIcon = playPauseBtn.querySelector('.codicon');
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
  parallelismInput.value = graphSettings.parallelism;
  managerStateEl.innerHTML = '';
  // Highlight execute button if an iteration is scheduled
  const executeBtn = document.getElementById('execute-btn');
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
  updateStatusPill();
}

// Map raw status to condensed uppercase label for overall pill.
function overallStatusText(status) {
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

function updateStatusPill() {
  let pillStatus = 'Disconnected';
  if (ws && ws.readyState === WebSocket.OPEN) {
    pillStatus = graphSettings?.status || 'Unspecified';
  }
  statusPill.className = '';
  statusPill.classList.add('status-pill', 'status-' + pillStatus);
  statusEmojiEl.textContent = statusEmoji(pillStatus);
  statusPill.textContent = overallStatusText(pillStatus);
}

function computeWsUrl() {
  const loc = window.location;
  if (!loc || !loc.host) {
    return 'ws://localhost:9001/'; // fallback when opened via file:// or unknown host
  }
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return proto + '//' + loc.host + '/ws';
}

function updateDerivedUrlDisplay() {
  if (connectBtn) {
    const url = computeWsUrl();
    connectBtn.title = 'Connect to WebSocket at ' + url;
    connectBtn.setAttribute('aria-label', 'Connect to WebSocket at ' + url);
  }
}

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return; // already open
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  manualDisconnect = false;
  const url = computeWsUrl();
  if (!url) return; // should not happen
  // Show transient connecting state using structured spans
  statusPill.className = 'status-pill status-Unspecified';
  statusEmojiEl.textContent = statusEmoji('Waiting');
  statusPill.textContent = overallStatusText('Connecting');
  log('Attempting connection to ' + url);
  try {
    ws = new WebSocket(url);
  } catch (e) {
    log('WebSocket creation failed: ' + e.message);
    scheduleReconnect();
    return;
  }
  setConnected(false);
  ws.addEventListener('open', () => {
    log('Connected');
    setConnected(true);
    // Immediately reflect connected pre-sync (graphSettings may not yet be populated)
    statusEmojiEl.textContent = statusEmoji('Ready');
    statusPill.textContent = overallStatusText('Connected');
  });
  ws.addEventListener('close', () => {
    log('Disconnected');
    setConnected(false);
    updateStatusPill();
    ws = null;
    if (!manualDisconnect) scheduleReconnect();
  });
  ws.addEventListener('error', (e) => {
    log('Error: ' + (e.message || e.type));
  });
  ws.addEventListener('message', onMessage);
}

function disconnect() {
  manualDisconnect = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    try {
      ws.close();
    } catch {}
    ws = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!manualDisconnect) {
      log('Reconnecting...');
      connect();
    }
  }, RECONNECT_INTERVAL_MS);
}

function sendCommand(cmd) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(cmd));
  }
}

function onMessage(ev) {
  try {
    var msg = JSON.parse(ev.data);
  } catch (e) {
    log('Bad JSON: ' + e);
    return;
  }
  function applyExecutionStates(stateArray) {
    if (!stateArray) return;
    stateArray.forEach((s) => {
      executionStates.set(s.name, s);
      const op = operations.get(s.name);
      if (op) {
        // Mirror dynamic fields that affect depiction
        op.isActive = s.isActive;
        op.status = s.status || op.status;
        op.runInThisIteration = s.runInThisIteration;
        op.logFileURLs = s.logFileURLs;
      }
    });
  }
  switch (msg.event) {
    case 'sync': {
      // Static graph
      operations.clear();
      msg.operations.forEach((o) => operations.set(o.name, o));
      // Dynamic states
      executionStates.clear();
      applyExecutionStates(msg.currentExecutionStates);
      queuedStates.clear();
      if (msg.queuedStates) msg.queuedStates.forEach((s) => queuedStates.set(s.name, s));
      graphSettings = msg.graphState;
      if (msg.lastExecutionResults) {
        lastExecutionResults = new Map();
        msg.lastExecutionResults.forEach((r) => lastExecutionResults.set(r.name, r));
      }
      const sessionText = msg.sessionInfo.actionName + ' — ' + msg.sessionInfo.repositoryIdentifier;
      if (appTitleEl) appTitleEl.textContent = 'rush ' + sessionText;
      document.title = 'rush ' + sessionText;
      markGraphDirty();
      break;
    }
    case 'sync-operations': {
      // Replace static graph definitions; retain existing dynamic state maps
      msg.operations.forEach((o) => operations.set(o.name, o));
      markGraphDirty();
      break;
    }
    case 'sync-graph-state': {
      graphSettings = msg.graphState;
      break;
    }
    case 'iteration-scheduled': {
      queuedStates.clear();
      msg.queuedStates.forEach((s) => queuedStates.set(s.name, s));
      break;
    }
    case 'before-execute': {
      applyExecutionStates(msg.executionStates);
      // Starting iteration invalidates queued states
      queuedStates.clear();
      break;
    }
    case 'after-execute': {
      applyExecutionStates(msg.executionStates);
      if (msg.lastExecutionResults) {
        lastExecutionResults = new Map();
        msg.lastExecutionResults.forEach((r) => lastExecutionResults.set(r.name, r));
      }
      break;
    }
    case 'status-change': {
      applyExecutionStates(msg.executionStates);
      break;
    }
  }
  // Handle terminal-chunk events (text from stdout/stderr). These should be appended
  // exactly as received; do not add extra line breaks.
  if (msg.event === 'terminal-chunk') {
    try {
      const raw = String(msg.text || '');
      const segments = processAnsiToSegments(raw);
      if (segments && segments.length) {
        for (const seg of segments) {
          const span = document.createElement('span');
          span.className = 'term-chunk ' + (msg.kind === 'stderr' ? 'stderr' : 'stdout');
          if (seg.style) span.setAttribute('style', seg.style);
          span.textContent = seg.text;
          terminalBody.appendChild(span);
        }
      }
      // Auto-scroll if enabled
      if (!termAutoScroll || termAutoScroll.checked) {
        terminalBody.scrollTop = terminalBody.scrollHeight;
      }
      if (terminalEl && !terminalEl.classList.contains('hidden')) {
        terminalEl.classList.add('term-flash');
        setTimeout(() => terminalEl.classList.remove('term-flash'), 350);
      }
    } catch (e) {
      // ignore terminal append errors
    }
  }
  // Ensure UI reflects any updated graph state (covers events that didn't call it earlier)
  updateManagerState();
  render();
}

// Terminal controls
if (termClearBtn && terminalBody) {
  termClearBtn.addEventListener('click', () => {
    terminalBody.innerHTML = '';
  });
}

// Initialize terminal placement based on top bar height and main margin
(function initTerminalLayout() {
  try {
    const topBar = document.getElementById('top-bar');
    if (topBar && terminalEl) {
      // Clear any fixed top positioning; layout is now flex-based
      terminalEl.style.top = '';
    }
  } catch (e) {}
})();

// Drag-resizer implementation
const resizer = document.getElementById('resizer');
if (resizer && terminalEl) {
  let dragging = false;
  let startX = 0;
  let startWidth = 0;
  const minW = 120;
  const maxW = Math.max(240, window.innerWidth - 200);
  resizer.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = terminalEl.getBoundingClientRect().width;
    resizer.setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = startX - e.clientX; // dragging left increases width
    let newW = startWidth + dx;
    newW = Math.max(minW, Math.min(maxW, newW));
    // Save width for unminimized use
    terminalEl._savedWidth = newW;
    if (!terminalEl.classList.contains('hidden')) {
      terminalEl.style.width = newW + 'px';
      terminalEl.style.flex = '0 0 ' + newW + 'px';
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    try {
      resizer.releasePointerCapture(e.pointerId);
    } catch {}
    document.body.style.userSelect = '';
  });
  // Make resizer keyboard accessible
  resizer.tabIndex = 0;
  resizer.addEventListener('keydown', (e) => {
    const step = 16;
    const rect = terminalEl.getBoundingClientRect();
    let w = rect.width;
    if (e.key === 'ArrowLeft') w = Math.max(minW, w - step);
    else if (e.key === 'ArrowRight') w = Math.min(maxW, w + step);
    terminalEl._savedWidth = w;
    if (!terminalEl.classList.contains('hidden')) {
      terminalEl.style.width = w + 'px';
      terminalEl.style.flex = '0 0 ' + w + 'px';
    }
  });
}

// Top-bar toggle: show/hide terminal. When shown the resizer is active and the
// last saved width is restored. When hidden the resizer is disabled and the
// terminal's width is remembered for the next show.
const toggleTerminalBtn = document.getElementById('toggle-terminal-btn');
if (toggleTerminalBtn && terminalEl) {
  toggleTerminalBtn.addEventListener('click', () => {
    const resizerEl = document.getElementById('resizer');
    const currentlyHidden = terminalEl.classList.contains('hidden');
    if (currentlyHidden) {
      // Show terminal
      terminalEl.classList.remove('hidden');
      if (resizerEl) resizerEl.classList.remove('hidden');
      // Restore saved width if present
      if (terminalEl._savedWidth) {
        terminalEl.style.width = terminalEl._savedWidth + 'px';
        terminalEl.style.flex = '0 0 ' + terminalEl._savedWidth + 'px';
      } else {
        terminalEl.style.width = '';
        terminalEl.style.flex = '';
      }
      if (resizerEl) resizerEl.tabIndex = 0;
      toggleTerminalBtn.setAttribute('aria-pressed', 'true');
      toggleTerminalBtn.classList.add('active');
    } else {
      // Hide terminal: remember current width then hide
      try {
        terminalEl._savedWidth = terminalEl.getBoundingClientRect().width;
      } catch (e) {}
      terminalEl.classList.add('hidden');
      if (resizerEl) {
        resizerEl.classList.add('hidden');
        resizerEl.tabIndex = -1;
      }
      // Clear inline sizing so layout reverts (we still keep _savedWidth)
      terminalEl.style.width = '';
      terminalEl.style.flex = '';
      toggleTerminalBtn.setAttribute('aria-pressed', 'false');
      toggleTerminalBtn.classList.remove('active');
    }
  });
  // initialize aria-pressed state
  const isVisible = !terminalEl.classList.contains('hidden');
  toggleTerminalBtn.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
  if (isVisible) toggleTerminalBtn.classList.add('active');
  else toggleTerminalBtn.classList.remove('active');
  // Wire terminal header controls (clear and autoscroll toggle)
  const termAutoscrollBtn = document.getElementById('term-autoscroll-btn');
  const termClearBtnEl = document.getElementById('term-clear-btn');
  const termAutoScrollCheckbox = document.getElementById('term-autoscroll');
  if (termClearBtnEl && terminalBody) {
    termClearBtnEl.addEventListener('click', () => {
      terminalBody.innerHTML = '';
    });
  }
  if (termAutoscrollBtn && termAutoScrollCheckbox) {
    // Initialize aria-pressed from checkbox
    termAutoscrollBtn.setAttribute('aria-pressed', termAutoScrollCheckbox.checked ? 'true' : 'false');
    termAutoscrollBtn.addEventListener('click', () => {
      const newVal = !termAutoScrollCheckbox.checked;
      termAutoScrollCheckbox.checked = newVal;
      termAutoscrollBtn.setAttribute('aria-pressed', newVal ? 'true' : 'false');
    });
  }
}

let currentView = 'table';
let currentFilter = 'all';
let searchQuery = '';
let filteredOutNames = new Set(); // status-based (e.g. not failed/warn when filter applied)
let searchFilteredOutNames = new Set(); // search text exclusions

// --- URL state persistence (view + filter) ---------------------------
function loadStateFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v === 'graph' || v === 'table') currentView = v;
    const f = params.get('filter');
    if (f === 'failed-warn' || f === 'all') currentFilter = f;
  } catch {}
}
function syncUrlFromState() {
  try {
    const params = new URLSearchParams(window.location.search);
    params.set('view', currentView);
    params.set('filter', currentFilter);
    const newUrl = window.location.pathname + '?' + params.toString() + window.location.hash;
    window.history.replaceState(null, '', newUrl);
  } catch {}
}
loadStateFromUrl();

function computeFilterSets() {
  filteredOutNames = new Set();
  searchFilteredOutNames = new Set();
  const q = searchQuery.trim().toLowerCase();
  const visible = [];
  for (const op of operations.values()) {
    const state = executionStates.get(op.name) || {};
    // merge dynamic fields so existing UI logic can still reference op.runInThisIteration etc.
    op.runInThisIteration = state.runInThisIteration;
    op.status = state.status || op.status;
    op.isActive = state.isActive;
    op.logFileURLs = state.logFileURLs;
    // Determine effective status (accounts for cache/previous run state)
    const effStatus = computeDisplayStatus(op);
    if (currentFilter === 'failed-warn') {
      if (!(effStatus === 'Failure' || effStatus === 'SuccessWithWarning')) {
        filteredOutNames.add(op.name); // graph will dim
        // Exclude from table
        continue;
      }
    }
    if (q && !op.name.toLowerCase().includes(q)) {
      searchFilteredOutNames.add(op.name); // graph dim variant, table hides
      continue;
    }
    visible.push(op);
  }
  return visible;
}
function filteredOperationsIterable() {
  const arr = computeFilterSets();
  return arr[Symbol.iterator]();
}

// Derive array of operations used for graph layout with pruning of noop nodes.
// New behavior: skip noop nodes that are leaves (no dependents) OR that have exactly
// one incoming edge OR exactly one outgoing edge. When pruning a noop, we will
// rewire dependencies so remaining ops connect directly (i.e., bypass removed noops).
function computeGraphOperations() {
  // Stable layout: always all operations; filtering only adjusts classes
  const base = Array.from(operations.values());
  computeFilterSets();
  if (!base.length) return base;
  // Build lookup and static dependents map (dependents = incoming adjacency)
  const byName = new Map();
  base.forEach((o) => byName.set(o.name, o));
  const dependents = new Map(); // name -> Set of direct dependent op names
  base.forEach((o) => {
    (o.dependencies || []).forEach((d) => {
      if (!byName.has(d)) return; // dependency outside filtered set not considered for pruning
      (dependents.get(d) || dependents.set(d, new Set()).get(d)).add(o.name);
    });
  });

  // Active set initially contains all nodes; we'll iteratively remove noop nodes
  // that meet the pruning criteria.
  const active = new Set(base.map((o) => o.name));
  const noopSet = new Set(base.filter((o) => o.noop).map((o) => o.name));

  // Compute initial counts (incoming = number of dependents, outgoing = number of deps)
  const incomingCount = new Map();
  const outgoingCount = new Map();
  base.forEach((o) => {
    incomingCount.set(o.name, (dependents.get(o.name) || new Set()).size);
    const out = (o.dependencies || []).filter((d) => byName.has(d)).length;
    outgoingCount.set(o.name, out);
  });

  // Queue noop nodes that are leaves or have exactly one incoming or one outgoing edge.
  const queue = [];
  active.forEach((n) => {
    if (!noopSet.has(n)) return;
    const inc = incomingCount.get(n) || 0;
    const out = outgoingCount.get(n) || 0;
    if (inc === 0 || inc === 1 || out === 1) queue.push(n);
  });

  while (queue.length) {
    const name = queue.pop();
    if (!active.has(name)) continue;
    // Remove this noop node
    active.delete(name);
    const op = byName.get(name);
    if (!op) continue;

    // For each dependency of the removed node, decrement its incoming count
    for (const dep of op.dependencies || []) {
      if (!active.has(dep)) continue;
      const prev = incomingCount.get(dep) || 0;
      incomingCount.set(dep, Math.max(0, prev - 1));
      const inc = incomingCount.get(dep);
      const out = outgoingCount.get(dep) || 0;
      if (noopSet.has(dep) && (inc === 0 || inc === 1 || out === 1)) queue.push(dep);
    }

    // For each dependent (nodes that depended on the removed node), decrement their outgoing count
    const depsOf = dependents.get(name) || new Set();
    for (const dependent of depsOf) {
      if (!active.has(dependent)) continue;
      const prevOut = outgoingCount.get(dependent) || 0;
      outgoingCount.set(dependent, Math.max(0, prevOut - 1));
      const inc = incomingCount.get(dependent) || 0;
      const out = outgoingCount.get(dependent) || 0;
      if (noopSet.has(dependent) && (inc === 0 || inc === 1 || out === 1)) queue.push(dependent);
    }
  }

  // At this point `active` contains node names to keep. We must return op objects
  // whose dependency lists are rewritten so that any dependency chains that went
  // through removed noop nodes are bypassed.
  const removed = new Set(base.map((o) => o.name).filter((n) => !active.has(n)));

  // Memoize resolved dependencies to avoid repeated recursion.
  const resolvedMemo = new Map();
  function resolveDeps(name, seen) {
    if (resolvedMemo.has(name)) return resolvedMemo.get(name);
    if (seen.has(name)) return new Set(); // break cycles defensively
    seen.add(name);
    const op = byName.get(name);
    const out = new Set();
    if (!op) return out;
    for (const d of op.dependencies || []) {
      if (!byName.has(d)) continue;
      if (active.has(d)) {
        out.add(d);
      } else {
        // dependency was removed; splice through it
        const sub = resolveDeps(d, seen);
        for (const s of sub) out.add(s);
      }
    }
    seen.delete(name);
    resolvedMemo.set(name, out);
    return out;
  }

  const result = base
    .filter((o) => active.has(o.name))
    .map((o) => {
      // Compute effective dependencies for o by splicing through removed noops
      const deps = new Set();
      for (const d of o.dependencies || []) {
        if (!byName.has(d)) continue;
        if (active.has(d)) deps.add(d);
        else {
          const sub = resolveDeps(d, new Set());
          for (const s of sub) deps.add(s);
        }
      }
      // Return a shallow copy so callers can freely inspect/modify dependencies
      return Object.assign({}, o, { dependencies: Array.from(deps) });
    });

  return result;
}

function render() {
  if (currentView === 'table') {
    renderTable();
  }
  if (currentView === 'graph') {
    ensureGraph();
  }
  updateSelectionUI();
}

// Pivoted table: rows = packages, columns = phases
function buildPivotData() {
  // Always compute the complete phase set from all known operations so columns are stable.
  const allPhases = new Set();
  for (const op of operations.values()) allPhases.add(op.phaseName);
  const phases = Array.from(allPhases).sort();
  // Packages only include rows that have at least one filtered-visible op OR (to keep row) we could show empty row
  // We'll still build using filtered operations for cell population, but phases list remains stable.
  const filteredOps = Array.from(filteredOperationsIterable());
  const map = new Map();
  for (const op of filteredOps) {
    let rec = map.get(op.packageName);
    if (!rec) {
      rec = { packageName: op.packageName, byPhase: new Map() };
      map.set(op.packageName, rec);
    }
    rec.byPhase.set(op.phaseName, op);
  }
  const packages = Array.from(map.values()).sort((a, b) => a.packageName.localeCompare(b.packageName));
  return { phases, packages };
}

function renderTable() {
  const { phases, packages } = buildPivotData();
  tableOpOrder = [];
  lastTablePhases = phases;
  lastTablePackages = packages;
  // Build header
  tableHead.innerHTML = '';
  const headerRow = document.createElement('tr');
  const pkgTh = document.createElement('th');
  pkgTh.textContent = 'Package';
  headerRow.appendChild(pkgTh);
  for (const phase of phases) {
    const th = document.createElement('th');
    const displayPhase = phase.replace(/^_phase:/, '');
    th.textContent = displayPhase;
    if (displayPhase !== phase) th.title = phase; // keep original as tooltip for clarity
    th.className = 'phase-col-header';
    th.style.cursor = 'pointer';
    th.addEventListener('click', (e) => {
      const phaseNames = [];
      for (const op of operations.values()) if (op.phaseName === phase) phaseNames.push(op.name);
      handleMultiSelectGroup(e, phaseNames);
    });
    headerRow.appendChild(th);
  }
  tableHead.appendChild(headerRow);
  // Body
  tableBody.innerHTML = '';
  let opCount = 0;
  packages.forEach((pkg, rowIndex) => {
    const tr = document.createElement('tr');
    tr.className = 'pkg-row';
    const namesInRow = Array.from(pkg.byPhase.values()).map((o) => o.name);
    const allSelected = namesInRow.length && namesInRow.every((n) => selection.has(n));
    if (allSelected) tr.classList.add('selected');
    const pkgTd = document.createElement('td');
    pkgTd.className = 'pkg-cell';
    pkgTd.textContent = pkg.packageName;
    pkgTd.style.fontWeight = '600';
    pkgTd.style.cursor = 'pointer';
    pkgTd.addEventListener('click', (e) => {
      handleMultiSelectGroup(e, namesInRow);
      e.stopPropagation();
    });
    tr.appendChild(pkgTd);
    phases.forEach((phase, phaseIndex) => {
      const td = document.createElement('td');
      td.className = 'pivot-cell';
      td.style.whiteSpace = 'nowrap';
      const op = pkg.byPhase.get(phase);
      if (op) {
        opCount++;
        const displayStatus = computeDisplayStatus(op);
        const glyph = enabledGlyph(op);
        const active = op.isActive ? '<span class="pivot-active" title="Active">⚡</span>' : '';
        td.innerHTML = `
                <span class="pivot-status-emoji">${statusEmoji(displayStatus)}</span>
                <span title="${escapeHtml(op.name)}" class="status-pill status-${escapeHtml(displayStatus)}">${escapeHtml(overallStatusText(displayStatus))}</span>
                <span class="pivot-enabled" title="${escapeHtml(buildRunPolicyText(op))}">${glyph}</span>
                ${active}
              `;
        td.title = buildTooltip(op, displayStatus);
        if (selection.has(op.name)) td.classList.add('selected');
        td.style.cursor = 'pointer';
        tableOpOrder.push(op.name);
        td.addEventListener('click', (e) => {
          handlePivotCellClick(e, op.name, rowIndex, phaseIndex);
          e.stopPropagation();
        });
      } else {
        td.innerHTML = '<span style="opacity:.25">—</span>';
      }
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });
  tableStats.textContent = opCount + ' operations';
}

function renderFlags(op) {
  const parts = [];
  if (op.silent) parts.push('<span title="silent" class="badge silent">S</span>');
  if (op.isActive) parts.push('<span title="active" class="badge active">A</span>');
  if (op.enabled === 'never') parts.push('<span title="disabled" class="badge disabled">D</span>');
  if (op.enabled === 'ignore-dependency-changes')
    parts.push('<span title="ignores dependency changes" class="badge local-only">I</span>');
  return parts.join('');
}

function handleMultiSelectSingle(e, name) {
  const isMeta = e.metaKey || e.ctrlKey;
  const isShift = e.shiftKey;
  const anchorExists = lastTableAnchorName && tableOpOrder.includes(lastTableAnchorName);
  if (isShift && anchorExists) {
    // Range selection. If meta also held, additive.
    const anchorIdx = tableOpOrder.indexOf(lastTableAnchorName);
    const idx = tableOpOrder.indexOf(name);
    if (idx !== -1) {
      const [s, eIdx] = anchorIdx < idx ? [anchorIdx, idx] : [idx, anchorIdx];
      const range = tableOpOrder.slice(s, eIdx + 1);
      if (e.metaKey || e.ctrlKey) {
        range.forEach((n) => selection.add(n));
      } else {
        selection = new Set(range);
      }
      selectionChanged();
      renderTable();
      if (currentView === 'graph') ensureGraph();
      return;
    }
  }
  if (isMeta) {
    if (selection.has(name)) selection.delete(name);
    else selection.add(name);
  } else {
    selection = new Set([name]);
  }
  lastTableAnchorName = name;
  selectionChanged();
  renderTable();
  if (currentView === 'graph') ensureGraph();
}

function handleMultiSelectGroup(e, names) {
  const isMeta = e.metaKey || e.ctrlKey;
  const isShift = e.shiftKey;
  // For a group, anchor becomes first element if not already set.
  if (isShift && lastTableAnchorName && tableOpOrder.includes(lastTableAnchorName)) {
    // Expand existing anchor to each item in names (additive if meta)
    if (!isMeta) selection = new Set(selection); // ensure Set reference independence
    names.forEach((n) => selection.add(n));
  } else if (isMeta) {
    // Toggle membership of the whole group
    let anyNew = false;
    names.forEach((n) => {
      if (!selection.delete(n)) {
        selection.add(n);
        anyNew = true;
      }
    });
    if (anyNew && names.length) lastTableAnchorName = names[0];
  } else {
    selection = new Set(names);
    if (names.length) lastTableAnchorName = names[0];
  }
  selectionChanged();
  renderTable();
  if (currentView === 'graph') ensureGraph();
}

function handlePivotCellClick(e, opName, rowIndex, phaseIndex) {
  if (!opName) return;
  const isMeta = e.metaKey || e.ctrlKey;
  const isShift = e.shiftKey;
  // If shift and we have an anchor coordinate, select rectangular region.
  if (isShift && lastTableAnchorCoord) {
    const { row: aRow, phase: aPhase } = lastTableAnchorCoord;
    const r1 = Math.min(aRow, rowIndex);
    const r2 = Math.max(aRow, rowIndex);
    const p1 = Math.min(aPhase, phaseIndex);
    const p2 = Math.max(aPhase, phaseIndex);
    const rectNames = new Set();
    for (let r = r1; r <= r2; r++) {
      const pkgRec = lastTablePackages[r];
      if (!pkgRec) continue;
      for (let p = p1; p <= p2; p++) {
        const phase = lastTablePhases[p];
        const cellOp = pkgRec.byPhase.get(phase);
        if (cellOp) rectNames.add(cellOp.name);
      }
    }
    if (isMeta) {
      // additive
      rectNames.forEach((n) => selection.add(n));
    } else {
      selection = rectNames;
    }
    selectionChanged();
    renderTable();
    if (currentView === 'graph') ensureGraph();
    return;
  }
  if (isMeta) {
    if (selection.has(opName)) selection.delete(opName);
    else selection.add(opName);
  } else {
    selection = new Set([opName]);
  }
  lastTableAnchorName = opName;
  lastTableAnchorCoord = { row: rowIndex, phase: phaseIndex };
  selectionChanged();
  renderTable();
  if (currentView === 'graph') ensureGraph();
}

function compare(a, b) {
  if (sortKey === 'status') {
    // Reuse phaseStatusPriorityIndex so ordering matches phase pane & legend
    const ap = phaseStatusPriorityIndex.get(a.status) ?? 999;
    const bp = phaseStatusPriorityIndex.get(b.status) ?? 999;
    if (ap !== bp) return ap < bp ? -1 * sortDir : 1 * sortDir;
    // Fallback alphabetical on status then name for stability
    const aStatus = (a.status || '').toLowerCase();
    const bStatus = (b.status || '').toLowerCase();
    if (aStatus < bStatus) return -1 * sortDir;
    if (aStatus > bStatus) return 1 * sortDir;
    const aName = (a.name || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();
    if (aName < bName) return -1 * sortDir;
    if (aName > bName) return 1 * sortDir;
    return 0;
  }
  let av = a[sortKey];
  let bv = b[sortKey];
  if (av === undefined) av = '';
  if (bv === undefined) bv = '';
  if (typeof av === 'string') av = av.toLowerCase();
  if (typeof bv === 'string') bv = bv.toLowerCase();
  if (av < bv) return -1 * sortDir;
  if (av > bv) return 1 * sortDir;
  return 0;
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function singleSelect(name) {
  selection.clear();
  selection.add(name);
  selectionChanged();
  if (currentView === 'graph' && !graphNeedsFullRender) updateGraph();
  else render();
}
function toggleSelect(name) {
  if (selection.has(name)) selection.delete(name);
  else selection.add(name);
  selectionChanged();
  if (currentView === 'graph' && !graphNeedsFullRender) updateGraph();
  else render();
}
function multiSelectRange(targetTr) {
  const trs = Array.from(tableBody.querySelectorAll('tr'));
  const last = selection.size
    ? trs.findIndex((tr) => tr.dataset.name === Array.from(selection).slice(-1)[0])
    : -1;
  const idx = trs.indexOf(targetTr);
  if (last === -1) {
    selection.add(targetTr.dataset.name);
    selectionChanged();
    render();
    return;
  }
  const [s, e] = last < idx ? [last, idx] : [idx, last];
  for (let i = s; i <= e; i++) selection.add(trs[i].dataset.name);
  selectionChanged();
  if (currentView === 'graph' && !graphNeedsFullRender) updateGraph();
  else render();
}

// Graph rendering
function computeLevels(filteredOps) {
  // longest path distance from any root (no deps referencing it). We'll build reverse adjacency.
  const indegree = new Map();
  const deps = new Map();
  filteredOps.forEach((op) => {
    deps.set(op.name, op.dependencies || []);
    indegree.set(op.name, op.dependencies.length);
  });
  // nodes with indegree 0 -> level 0 (bottom)
  const queue = [];
  indegree.forEach((v, k) => {
    if (v === 0) queue.push(k);
  });
  const level = new Map();
  queue.forEach((k) => level.set(k, 0));
  while (queue.length) {
    const cur = queue.shift();
    const curLevel = level.get(cur) || 0;
    // find dependents (reverse edges)
    filteredOps.forEach((op) => {
      if (op.dependencies.includes(cur)) {
        indegree.set(op.name, indegree.get(op.name) - 1);
        if (!level.has(op.name) || level.get(op.name) < curLevel + 1) level.set(op.name, curLevel + 1);
        if (indegree.get(op.name) === 0) queue.push(op.name);
      }
    });
  }
  return level; // bottom-up levels
}

// Incremental graph rendering support ------------------------------------
function getStatusColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    Ready: cs.getPropertyValue('--status-ready').trim(),
    Waiting: cs.getPropertyValue('--status-waiting').trim(),
    Queued: cs.getPropertyValue('--status-queued').trim(),
    Executing: cs.getPropertyValue('--status-executing')?.trim() || cs.getPropertyValue('--warn').trim(),
    Success: cs.getPropertyValue('--status-success')?.trim() || cs.getPropertyValue('--success').trim(),
    SuccessWithWarning: cs.getPropertyValue('--status-success-warning').trim(),
    Skipped: cs.getPropertyValue('--status-skipped').trim(),
    FromCache: cs.getPropertyValue('--status-from-cache').trim(),
    Failure: cs.getPropertyValue('--status-failure')?.trim() || cs.getPropertyValue('--danger').trim(),
    Blocked: cs.getPropertyValue('--status-blocked').trim(),
    NoOp: cs.getPropertyValue('--status-noop').trim(),
    Aborted: cs.getPropertyValue('--status-aborted').trim()
  };
}
let statusColors = getStatusColors();
// Recompute on theme change (if any custom property mutations occur)
const mo = new MutationObserver(() => {
  statusColors = getStatusColors();
});
mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
// Simple color dimming: blend toward backdrop (#1e293b) and optionally reduce saturation
function dimColor(hex, amount = 0.55) {
  // Expect #rrggbb
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) return hex || '#4b5563';
  if (hex[0] === '#') hex = hex.slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Backdrop (tailwind slate-800-ish)
  const br = 30,
    bg = 41,
    bb = 59; // #1e293b
  const nr = Math.round(r * (1 - amount) + br * amount);
  const ng = Math.round(g * (1 - amount) + bg * amount);
  const nb = Math.round(b * (1 - amount) + bb * amount);
  return (
    '#' +
    nr.toString(16).padStart(2, '0') +
    ng.toString(16).padStart(2, '0') +
    nb.toString(16).padStart(2, '0')
  );
}
// Compact graph layout constants
const GRAPH_NODE_WIDTH = 28;
const GRAPH_NODE_HEIGHT = 28;
const GRAPH_COL_WIDTH = 46; // horizontal step ( >= node width )
const GRAPH_NODE_GAP = 10; // extra gap when multiple per level
const GRAPH_LEVEL_GAP = 70; // vertical distance between levels
const GRAPH_BASE_X = 16;
const GRAPH_BASE_Y = 16;
let graphNeedsFullRender = true; // set true on sync/filter changes
const graphState = {
  nodePositions: new Map(), // name -> { x,y }
  nodeStatus: new Map(), // name -> last displayStatus used for coloring
  nodeElements: new Map(), // name -> div element
  edgeElements: [] // array of { path, from, to }
};

function markGraphDirty() {
  graphNeedsFullRender = true;
  if (currentView === 'graph') ensureGraph();
}

function ensureGraph() {
  if (graphNeedsFullRender) {
    buildGraph();
    graphNeedsFullRender = false;
  } else {
    updateGraph();
  }
}

function buildGraph() {
  // Clear existing
  graphState.nodePositions.clear();
  graphState.nodeStatus.clear();
  graphState.nodeElements.forEach((el) => el.remove());
  graphState.nodeElements.clear();
  graphState.edgeElements.forEach((e) => e.path.remove());
  graphState.edgeElements.length = 0;
  // Remove any existing marquee from previous renders
  if (graphMarqueeEl) {
    graphMarqueeEl.remove();
    graphMarqueeEl = null;
  }
  // Recreate markers
  edgesSvg.innerHTML =
    '<defs>' +
    Object.entries(statusColors)
      .map(
        ([s, c]) =>
          `<marker id="arrowhead-${s}" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${c}" /></marker>`
      )
      .join('') +
    '</defs>';
  const filteredOpsArr = computeGraphOperations();
  const level = computeLevels(filteredOpsArr);
  const groups = {};
  level.forEach((l, name) => (groups[l] || (groups[l] = [])).push(name));
  const sortedLevels = Object.keys(groups)
    .map(Number)
    .sort((a, b) => a - b);
  const levelGap = GRAPH_LEVEL_GAP;
  const nodeGap = GRAPH_NODE_GAP;
  const baseY = GRAPH_BASE_Y;
  const baseX = GRAPH_BASE_X;
  const colWidth = GRAPH_COL_WIDTH;
  const maxLevel = sortedLevels.length ? Math.max(...sortedLevels) : 0;
  // Precompute metrics for ordering within each level
  // 1. Critical path length (max distance to any sink / number of edges in the longest path downstream).
  // 2. Number of consumers (direct dependents) within the filtered/pruned graph.
  const dependentsMap = new Map(); // name -> Set of direct dependents
  filteredOpsArr.forEach((op) => {
    (op.dependencies || []).forEach((d) => {
      if (!operations.has(d)) return;
      (dependentsMap.get(d) || dependentsMap.set(d, new Set()).get(d)).add(op.name);
    });
  });
  // Build adjacency (forward edges) for DFS of downstream paths within filtered set only
  const byNameFiltered = new Map(filteredOpsArr.map((o) => [o.name, o]));
  const memoCpl = new Map();
  function criticalPathLen(name) {
    if (memoCpl.has(name)) return memoCpl.get(name);
    const op = byNameFiltered.get(name);
    if (!op) {
      memoCpl.set(name, 0);
      return 0;
    }
    const deps = Array.from(dependentsMap.get(name) || []);
    if (!deps.length) {
      memoCpl.set(name, 0);
      return 0;
    }
    let best = 0;
    for (const d of deps) {
      best = Math.max(best, 1 + criticalPathLen(d));
    }
    memoCpl.set(name, best);
    return best;
  }
  sortedLevels.forEach((l) => {
    const nodes = groups[l];
    // Sort using metrics: critical path length DESC, consumers count DESC, name ASC
    nodes.sort((a, b) => {
      const cplA = criticalPathLen(a);
      const cplB = criticalPathLen(b);
      if (cplA !== cplB) return cplB - cplA;
      const consA = (dependentsMap.get(a) || new Set()).size;
      const consB = (dependentsMap.get(b) || new Set()).size;
      if (consA !== consB) return consB - consA;
      return a.localeCompare(b);
    });
    const levelIndexFromTop = maxLevel - l;
    nodes.forEach((name, j) => {
      const op = operations.get(name);
      if (!op) return;
      const x = baseX + j * (colWidth + nodeGap); // left-aligned, no centering offset
      const y = baseY + levelIndexFromTop * levelGap;
      const div = document.createElement('div');
      div.className = 'op-node';
      div.dataset.name = name;
      div.style.transform = `translate(${x}px, ${y}px)`;
      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'emoji';
      emojiSpan.textContent = statusEmoji(computeDisplayStatus(op));
      div.appendChild(emojiSpan);
      // Enabled-state superscript (will be populated in updateGraph)
      const enabledSup = document.createElement('span');
      enabledSup.className = 'enabled-indicator';
      enabledSup.textContent = ''; // set later
      div.appendChild(enabledSup);
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey) toggleSelect(name);
        else singleSelect(name);
      });
      graphEl.appendChild(div);
      graphState.nodePositions.set(name, { x, y });
      graphState.nodeElements.set(name, div);
    });
  });
  // Build edges with redundant edge pruning.
  // Heuristic transitive reduction: For edge A->C, if there exists a dependency B where A->B and B can reach C, omit A->C.
  const byName = new Map(filteredOpsArr.map((o) => [o.name, o]));
  const memoReach = new Map(); // name -> Set of reachable deps (transitive)
  function getReachable(name) {
    if (memoReach.has(name)) return memoReach.get(name);
    const op = byName.get(name);
    const visited = new Set();
    if (op) {
      const stack = [...(op.dependencies || [])];
      while (stack.length) {
        const d = stack.pop();
        if (visited.has(d)) continue;
        visited.add(d);
        const dop = byName.get(d);
        if (dop) stack.push(...(dop.dependencies || []));
      }
    }
    memoReach.set(name, visited);
    return visited;
  }
  const edgeRecords = [];
  for (const op of filteredOpsArr) {
    const deps = op.dependencies || [];
    for (const depName of deps) {
      if (!byName.has(depName)) continue;
      // Check redundancy: if any sibling dependency path makes this direct edge unnecessary
      let redundant = false;
      for (const intermediate of deps) {
        if (intermediate === depName) continue;
        if (!byName.has(intermediate)) continue;
        const reach = getReachable(intermediate);
        if (reach.has(depName)) {
          redundant = true;
          break;
        }
      }
      if (redundant) continue;
      const fromPos = graphState.nodePositions.get(op.name);
      const toPos = graphState.nodePositions.get(depName);
      if (!fromPos || !toPos) continue;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      edgeRecords.push({ path, from: op.name, to: depName });
      edgesSvg.appendChild(path);
    }
  }
  graphState.edgeElements = edgeRecords;
  // After structural build, do first status+style update
  updateGraph();
  // Resize svg
  if (graphState.nodePositions.size) {
    const maxX =
      Math.max(...Array.from(graphState.nodePositions.values()).map((p) => p.x)) + GRAPH_NODE_WIDTH + 40;
    const maxY =
      Math.max(...Array.from(graphState.nodePositions.values()).map((p) => p.y)) +
      levelGap +
      GRAPH_NODE_HEIGHT;
    edgesSvg.setAttribute('width', maxX);
    edgesSvg.setAttribute('height', maxY);
  }
}

function computeDisplayStatus(op) {
  // prefer dynamic execution state status if available
  const state = executionStates.get(op.name);
  let displayStatus = (state && state.status) || op.status;
  const runInThisIteration = state ? state.runInThisIteration : op.runInThisIteration;
  if (runInThisIteration === false) {
    const prev = lastExecutionResults.get(op.name);
    if (prev && prev.status) displayStatus = prev.status;
    else displayStatus = 'Skipped';
  }
  // If operation has never executed (no current state and no previous result), mark as Unknown
  if (!displayStatus) {
    const last = lastExecutionResults.get(op.name);
    if (!last || !last.status) {
      displayStatus = 'Unknown';
    }
  }
  return displayStatus;
}

function enabledGlyph(op) {
  if (op.noop) return '⚪';
  switch (op.enabled) {
    case 'never':
      return '🔴';
    case 'ignore-dependency-changes':
      return '🟡';
    case 'affected':
    default:
      return '🟢';
  }
}

function buildRunPolicyText(op) {
  if (op.noop) return 'Operation does no work';
  switch (op.enabled) {
    case 'never':
      return 'Never run';
    case 'ignore-dependency-changes':
      return 'Ignores dependency changes'; // legacy + new unified
    case 'affected':
    default:
      return 'Run if affected';
  }
}

function buildTooltip(op, lastResultStatus) {
  const policy = buildRunPolicyText(op);
  const activeLine = op.isActive ? '\nHas in-memory state' : '';
  return `${op.name}\nLast Result: ${lastResultStatus}\n${policy}${activeLine}`;
}

function updateGraph() {
  // Update nodes (emoji + border color only)
  for (const [name, div] of graphState.nodeElements.entries()) {
    const op = operations.get(name);
    if (!op) continue;
    const displayStatus = computeDisplayStatus(op);
    const prevStatus = graphState.nodeStatus.get(name);
    const state = executionStates.get(name);
    const runInThisIteration = state ? state.runInThisIteration : op.runInThisIteration;
    const notRunning = runInThisIteration === false || op.noop;
    const queuedState = queuedStates.get(name);
    const isQueuedNext = !!(queuedState && queuedState.runInThisIteration === true);
    const isFilteredOut = filteredOutNames.has(name);
    const isSearchFiltered = searchFilteredOutNames.has(name);
    const emojiSpan = div.querySelector('.emoji');
    if (emojiSpan && (prevStatus !== displayStatus || !emojiSpan.textContent)) {
      emojiSpan.textContent = statusEmoji(displayStatus);
    }
    // Enabled-state superscript indicator logic
    const enabledSpan = div.querySelector('.enabled-indicator');
    if (enabledSpan) {
      let indicator = '';
      if (op.noop) {
        indicator = '⚪';
        enabledSpan.title = 'No-op operation';
      } else {
        switch (op.enabled) {
          case 'never':
            indicator = '🔴';
            enabledSpan.title = 'Disabled';
            break;
          case 'ignore-dependency-changes':
            indicator = '🟡';
            enabledSpan.title = 'Ignores dependency changes';
            break;
          case 'affected':
          default:
            indicator = '🟢';
            enabledSpan.title = 'Enabled';
            break;
        }
      }
      if (enabledSpan.textContent !== indicator) enabledSpan.textContent = indicator;
    }
    let baseColor = statusColors[displayStatus] || '#4b5563';
    // Apply dimming to border color for filtered states (search stronger than status filter)
    if (isSearchFiltered) baseColor = dimColor(baseColor, 0.72);
    else if (isFilteredOut) baseColor = dimColor(baseColor, 0.6);
    else if (notRunning) baseColor = dimColor(baseColor, 0.35); // subtle dim for not-in-iteration
    div.style.borderColor = baseColor;
    // selection & run-state styling
    if (selection.has(name)) div.classList.add('selected');
    else div.classList.remove('selected');
    // Active indicator (rocket bottom-left)
    let activeSpan = div.querySelector('.active-indicator');
    if (op.isActive) {
      if (!activeSpan) {
        activeSpan = document.createElement('span');
        activeSpan.className = 'active-indicator';
        activeSpan.textContent = '⚡';
        div.appendChild(activeSpan);
      }
      activeSpan.title = 'Active (in-memory state)';
    } else if (activeSpan) {
      activeSpan.remove();
    }
    // Pending changes indicator (queued for iteration) shows clock top-left
    let pendingSpan = div.querySelector('.pending-indicator');
    if (isQueuedNext) {
      if (!pendingSpan) {
        pendingSpan = document.createElement('span');
        pendingSpan.className = 'pending-indicator';
        pendingSpan.textContent = '🕒';
        div.appendChild(pendingSpan);
      }
      pendingSpan.title = 'Pending changes (iteration queued)';
    } else if (pendingSpan) {
      pendingSpan.remove();
    }
    // Clear style classes first (we no longer dim node background, only border & text)
    div.classList.remove('not-running', 'filtered-out', 'filtered-out-search', 'dashed', 'dotted');
    // Apply filters first; search filter strongest fade, then status filter, else not-running state
    if (isSearchFiltered) {
      div.classList.add('filtered-out-search');
    } else if (isFilteredOut) {
      div.classList.add('filtered-out');
    } else if (notRunning) {
      div.classList.add('not-running');
    }
    // Enabled indicator inherits node opacity; no special handling needed.
    // queued-next styling removed; rely solely on clock indicator
    // Tooltip for context (name + status + optional active note)
    div.title = buildTooltip(op, displayStatus);
    graphState.nodeStatus.set(name, displayStatus);
  }
  // Update edges
  for (const rec of graphState.edgeElements) {
    const fromPos = graphState.nodePositions.get(rec.from);
    const toPos = graphState.nodePositions.get(rec.to);
    if (!fromPos || !toPos) continue;
    // Anchor points: bottom-center of source -> top-center of destination
    const startX = fromPos.x + GRAPH_NODE_WIDTH / 2;
    const startY = fromPos.y + GRAPH_NODE_HEIGHT; // bottom of source
    const endX = toPos.x + GRAPH_NODE_WIDTH / 2;
    const endY = toPos.y; // top of destination

    // Compute how many rows apart they are using the level gap constant
    const rowsApart = Math.max(1, Math.round((toPos.y - fromPos.y) / GRAPH_LEVEL_GAP));

    // Horizontal column step between node centers
    const colStep = GRAPH_COL_WIDTH + GRAPH_NODE_GAP;

    // Helper that emits a quadratic curve path segment from (sx,sy) to (ex,ey)
    // with control points offset vertically from endpoints by 1/4 of vertical distance
    function quadratic(sx, sy, ex, ey) {
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      // Vertical offset magnitude for endpoint control points
      const baseOffset = (ey - sy) / 4;
      return `Q ${sx} ${sy + baseOffset} ${mx} ${my} ${ex} ${my + baseOffset} ${ex} ${ey}`;
    }

    let d = '';
    if (startX === endX && rowsApart === 1) {
      // Direct vertical line from bottom of source to top of destination
      d = `M ${startX} ${startY} L ${endX} ${endY}`;
    } else if (rowsApart === 1) {
      // Exactly one row apart but different x: curve to exact midpoint then to dest
      // We'll go from bottom of source -> midpoint -> top of dest using two cubic beziers
      d = `M ${startX} ${startY} ` + quadratic(startX, startY, endX, endY);
    } else {
      // More than one row apart: build S-curve to an intermediate x (half-column shifted),
      // vertical travel, then S-curve into destination.
      const dir = Math.sign(endX - startX) || 1; // default to positive X if aligned
      const halfColShift = colStep / 2;
      // Prefer roughly halfway horizontally between source and destination
      const candidateX = startX + (endX - startX) * 0.5;
      // Determine number of column steps between the two nodes
      const deltaCols = Math.max(1, Math.round(Math.abs(endX - startX) / colStep));
      // If the candidate lands too close to any column center (i.e. inside a node),
      // nudge it by half a column into the gap between columns in the direction of travel.
      let intermediateX = candidateX;
      let tooClose = false;
      for (let k = 0; k <= deltaCols; k++) {
        const center = startX + dir * k * colStep;
        if (Math.abs(candidateX - center) < GRAPH_NODE_WIDTH / 2 + 2) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) intermediateX = candidateX + dir * halfColShift;

      // Y where we first arrive after the S-curve from the source:
      // set to the top Y coordinate of the row immediately below the source.
      // This equals origin row top (fromPos.y) + GRAPH_LEVEL_GAP.
      const firstTargetY = fromPos.y + GRAPH_LEVEL_GAP;

      // Y at which we stop vertical travel: bottom of the row directly above destination
      const bottomOfRowAboveDest = toPos.y - GRAPH_LEVEL_GAP + GRAPH_NODE_HEIGHT;

      // Ensure we don't compute inverted vertical ranges
      const midY1 = firstTargetY;
      const midY2 = bottomOfRowAboveDest;

      // Build pieces:
      // 1) S-curve from start -> (intermediateX, midY1)
      d = `M ${startX} ${startY} ` + quadratic(startX, startY, intermediateX, midY1);
      // 2) Vertical line from midY1 -> midY2 at intermediateX
      d += ` L ${intermediateX} ${midY2}`;
      // 3) S-curve from (intermediateX, midY2) -> destination top
      d += ' ' + quadratic(intermediateX, midY2, endX, endY);
    }

    rec.path.setAttribute('d', d);
    const depStatus = graphState.nodeStatus.get(rec.to) || 'Ready';
    rec.path.setAttribute('stroke', statusColors[depStatus] || '#4b5563');
    rec.path.setAttribute('class', 'edge');
    rec.path.setAttribute('marker-end', `url(#arrowhead-${depStatus})`);
    const fromOp = operations.get(rec.from);
    if (selection.has(rec.to) && selection.has(rec.from)) rec.path.classList.add('highlight');
    else rec.path.classList.remove('highlight');
    // Apply style classes
    rec.path.classList.remove('dashed', 'dotted', 'filtered-out', 'not-running');
    rec.path.classList.remove('filtered-out-search');
    const fromState = fromOp ? executionStates.get(rec.from) : undefined;
    const fromRunInThisIteration = fromState ? fromState.runInThisIteration : fromOp?.runInThisIteration;
    const fromNotRunning = fromOp && (fromRunInThisIteration === false || fromOp.noop);
    const edgeStatusFiltered = filteredOutNames.has(rec.from) || filteredOutNames.has(rec.to);
    const edgeSearchFiltered = searchFilteredOutNames.has(rec.from) || searchFilteredOutNames.has(rec.to);
    if (edgeSearchFiltered || edgeStatusFiltered || fromNotRunning) {
      let strokeColor = statusColors[depStatus] || '#4b5563';
      if (edgeSearchFiltered) {
        strokeColor = dimColor(strokeColor, 0.78);
        rec.path.style.opacity = '0.22';
      } else if (edgeStatusFiltered) {
        strokeColor = dimColor(strokeColor, 0.65);
        rec.path.style.opacity = '0.3';
      } else if (fromNotRunning) {
        strokeColor = dimColor(strokeColor, 0.4);
        rec.path.style.opacity = '0.42';
      }
      rec.path.setAttribute('stroke', strokeColor);
      rec.path.setAttribute('marker-end', `url(#arrowhead-${depStatus})`);
    } else {
      // Clear any explicit opacity set by filtering rules
      rec.path.style.opacity = '';
      // Dim edges that are not semantically important (not executing or failed)
      const semImportant = depStatus === 'Executing' || depStatus === 'Failure';
      if (!semImportant && !rec.path.classList.contains('highlight')) {
        rec.path.classList.add('dim');
      } else {
        rec.path.classList.remove('dim');
      }
    }
  }
  // Update phase pane after node/edge status refresh
  renderPhasePane();
  renderLegend();
  updateSelectionUI();
}

// Selection bar management
function updateSelectionUI() {
  const bar = document.getElementById('selection-bar');
  if (!bar) return;
  const hasSel = selection.size > 0;
  // Always visible: heading shows context; selection-only buttons hidden if none
  bar.style.display = 'flex';
  const headingSpan = document.getElementById('view-heading-text');
  if (headingSpan) {
    headingSpan.textContent = currentView === 'graph' ? 'Dependency Graph' : 'Operations Table';
  }
  const selectionButtonsIds = [
    'invalidate-btn',
    'close-runners-btn',
    'set-enabled-default-btn',
    'set-enabled-ignore-deps-btn',
    'set-enabled-disabled-btn',
    'expand-deps-btn',
    'expand-consumers-btn'
  ];
  selectionButtonsIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      // Enable only if we have selection AND we are connected (ws open)
      const connected = ws && ws.readyState === WebSocket.OPEN;
      el.disabled = !(hasSel && connected);
    }
  });
  const clearBtn = document.getElementById('clear-selection-btn');
  if (clearBtn) {
    const connected = ws && ws.readyState === WebSocket.OPEN;
    clearBtn.disabled = !(hasSel && connected);
  }
  const countSpan = document.getElementById('selection-count');
  if (countSpan) {
    const n = selection.size;
    countSpan.textContent = n + (n === 1 ? ' selected' : ' selected');
  }
  if (clearBtn) {
    clearBtn.title = 'Clear selection';
    clearBtn.setAttribute('aria-label', 'Clear selection');
  }
}

function selectionChanged() {
  // Immediate visibility update for selection bar to reduce perceived lag.
  updateSelectionUI();
}

function expandSelectionDependencies() {
  if (!selection.size) return;
  const queue = [...selection];
  const seen = new Set(selection);
  while (queue.length) {
    const name = queue.shift();
    const op = operations.get(name);
    if (!op) continue;
    for (const dep of op.dependencies || []) {
      if (!seen.has(dep) && operations.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  const changed = seen.size !== selection.size;
  selection = seen;
  if (changed) {
    selectionChanged();
    if (currentView === 'graph') ensureGraph();
    render();
  }
}

function expandSelectionConsumers() {
  if (!selection.size) return;
  // Build reverse adjacency once
  const dependents = new Map();
  for (const op of operations.values()) {
    for (const dep of op.dependencies || []) {
      if (!operations.has(dep)) continue;
      (dependents.get(dep) || dependents.set(dep, new Set()).get(dep)).add(op.name);
    }
  }
  const queue = [...selection];
  const seen = new Set(selection);
  while (queue.length) {
    const name = queue.shift();
    const deps = dependents.get(name);
    if (!deps) continue;
    for (const consumer of deps) {
      if (!seen.has(consumer)) {
        seen.add(consumer);
        queue.push(consumer);
      }
    }
  }
  const changed = seen.size !== selection.size;
  selection = seen;
  if (changed) {
    selectionChanged();
    if (currentView === 'graph') ensureGraph();
    render();
  }
}

// --- Drag (marquee) selection for graph view -------------------------
let graphMarqueeEl = null;
let dragSelecting = false;
let dragStart = null; // {x,y} in graphEl coords
let dragLast = null; // last mouse move pos
let preDragSelection = null; // Set of names existing before drag

function graphPointFromEvent(e) {
  const rect = graphEl.getBoundingClientRect();
  return { x: e.clientX - rect.left + graphEl.scrollLeft, y: e.clientY - rect.top + graphEl.scrollTop };
}

function beginDragSelection(e) {
  if (currentView !== 'graph') return;
  // Only left button
  if (e.button !== 0) return;
  // Avoid starting when clicking directly on a node (node click logic will handle single selection)
  if (e.target && e.target.closest && e.target.closest('.op-node')) return;
  dragSelecting = true;
  dragStart = graphPointFromEvent(e);
  dragLast = dragStart;
  preDragSelection = new Set(selection);
  graphMarqueeEl = document.createElement('div');
  graphMarqueeEl.className = 'graph-marquee';
  graphEl.appendChild(graphMarqueeEl);
  updateMarquee();
  e.preventDefault();
}

function updateMarquee() {
  if (!dragSelecting || !graphMarqueeEl || !dragStart || !dragLast) return;
  const x1 = Math.min(dragStart.x, dragLast.x);
  const y1 = Math.min(dragStart.y, dragLast.y);
  const x2 = Math.max(dragStart.x, dragLast.x);
  const y2 = Math.max(dragStart.y, dragLast.y);
  graphMarqueeEl.style.left = x1 + 'px';
  graphMarqueeEl.style.top = y1 + 'px';
  graphMarqueeEl.style.width = x2 - x1 + 'px';
  graphMarqueeEl.style.height = y2 - y1 + 'px';
  // Hit test nodes
  const newlySelected = new Set();
  for (const [name, pos] of graphState.nodePositions.entries()) {
    // Node bounding box
    const nx1 = pos.x;
    const ny1 = pos.y;
    const nx2 = pos.x + GRAPH_NODE_WIDTH;
    const ny2 = pos.y + GRAPH_NODE_HEIGHT;
    if (nx2 < x1 || nx1 > x2 || ny2 < y1 || ny1 > y2) continue; // no intersect
    newlySelected.add(name);
  }
  // Determine selection behavior
  // Default: replace with marquee set; If shift/meta/ctrl: add; If alt: subtract
  let finalSelection;
  if (dragModifierMode === 'add') {
    finalSelection = new Set(preDragSelection);
    newlySelected.forEach((n) => finalSelection.add(n));
  } else if (dragModifierMode === 'subtract') {
    finalSelection = new Set(preDragSelection);
    newlySelected.forEach((n) => finalSelection.delete(n));
  } else {
    finalSelection = newlySelected;
  }
  selection = finalSelection;
  updateGraph(); // incremental refresh without full rebuild
}

let dragModifierMode = 'replace'; // 'replace' | 'add' | 'subtract'

function updateDragModifierMode(e) {
  if (e.altKey) dragModifierMode = 'subtract';
  else if (e.metaKey || e.ctrlKey || e.shiftKey) dragModifierMode = 'add';
  else dragModifierMode = 'replace';
}

graphEl.addEventListener('mousedown', (e) => {
  updateDragModifierMode(e);
  beginDragSelection(e);
});
graphEl.addEventListener('mousemove', (e) => {
  if (!dragSelecting) return;
  dragLast = graphPointFromEvent(e);
  updateDragModifierMode(e);
  updateMarquee();
  e.preventDefault();
});
window.addEventListener('mouseup', (e) => {
  if (!dragSelecting) return;
  dragSelecting = false;
  if (graphMarqueeEl) {
    graphMarqueeEl.remove();
    graphMarqueeEl = null;
  }
  dragStart = null;
  dragLast = null;
  preDragSelection = null;
});
// Keep modifier mode in sync if user changes keys mid-drag outside graph area
window.addEventListener('keydown', (e) => {
  if (dragSelecting) {
    updateDragModifierMode(e);
    updateMarquee();
  }
});
window.addEventListener('keyup', (e) => {
  if (dragSelecting) {
    updateDragModifierMode(e);
    updateMarquee();
  }
});

// Phase summary pane ----------------------------------------------------
const phaseStatusPriority = [
  'Failure',
  'SuccessWithWarning',
  'Blocked',
  'Aborted',
  'Executing',
  'Queued',
  'Ready',
  'Waiting',
  'Success',
  'Skipped',
  'FromCache',
  'NoOp'
];
const phaseStatusPriorityIndex = new Map(phaseStatusPriority.map((s, i) => [s, i]));

function computePhaseSummaries() {
  const byPhase = new Map(); // phase -> { ops: [], statusSet: Set }
  const graphMembership =
    graphState && graphState.nodePositions.size ? new Set(graphState.nodePositions.keys()) : null;
  for (const op of operations.values()) {
    const phase = op.phaseName || '(none)';
    const displayStatus = computeDisplayStatus(op);
    // Always include Executing operations so they are visible even if filtered out of the graph (e.g. failed-warn filter)
    if (graphMembership && displayStatus !== 'Executing' && !graphMembership.has(op.name)) {
      continue;
    }
    let rec = byPhase.get(phase);
    if (!rec) {
      rec = { ops: [], statusSet: new Set() };
      byPhase.set(phase, rec);
    }
    rec.ops.push({ op, displayStatus });
    rec.statusSet.add(displayStatus);
  }
  const summaries = [];
  for (const [phase, rec] of byPhase.entries()) {
    // Determine most significant status by lowest index in priority list
    let chosen = null;
    let bestIdx = Infinity;
    for (const s of rec.statusSet) {
      const idx = phaseStatusPriorityIndex.get(s);
      if (idx !== undefined && idx < bestIdx) {
        bestIdx = idx;
        chosen = s;
      }
    }
    if (!chosen) {
      chosen = 'Ready';
    }
    // Problem operations list includes failures, warnings, and currently executing operations
    const problemOps = rec.ops.filter(
      ({ displayStatus }) =>
        displayStatus === 'Failure' || displayStatus === 'SuccessWithWarning' || displayStatus === 'Executing'
    );
    summaries.push({ phase, status: chosen, problemOps });
  }
  summaries.sort((a, b) => a.phase.localeCompare(b.phase));
  return summaries;
}

function renderPhasePane() {
  if (!phaseGroupsEl) return;
  const summaries = computePhaseSummaries();
  phaseGroupsEl.innerHTML = '';
  if (!summaries.length) {
    const empty = document.createElement('div');
    empty.className = 'phase-pane-empty';
    empty.textContent = 'No phases';
    phaseGroupsEl.appendChild(empty);
    return;
  }
  for (const s of summaries) {
    const div = document.createElement('div');
    div.className = 'phase-group';
    const header = document.createElement('div');
    header.className = 'phase-header';
    const emoji = document.createElement('span');
    emoji.className = 'phase-status-emoji';
    emoji.textContent = statusEmoji(s.status);
    const nameSpan = document.createElement('span');
    nameSpan.className = 'phase-name';
    // Only strip the exact leading `_phase:` prefix if present
    nameSpan.textContent = s.phase.replace(/^_phase:/, '');
    header.appendChild(emoji);
    header.appendChild(nameSpan);
    div.appendChild(header);
    if (s.problemOps.length) {
      const ul = document.createElement('ul');
      ul.className = 'phase-problems';
      // Sort by status priority, then by operation name for stability
      const sortedProblems = [...s.problemOps].sort((a, b) => {
        const ai = phaseStatusPriorityIndex.get(a.displayStatus) ?? 999;
        const bi = phaseStatusPriorityIndex.get(b.displayStatus) ?? 999;
        if (ai !== bi) return ai - bi;
        const an = a.op.name.toLowerCase();
        const bn = b.op.name.toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return 0;
      });
      for (const { op, displayStatus } of sortedProblems) {
        const li = document.createElement('li');
        const emo = document.createElement('span');
        emo.className = 'phase-problem-emoji';
        emo.textContent = statusEmoji(displayStatus);
        li.appendChild(emo);
        const logUrl =
          (op.logFileURLs && (op.logFileURLs.text || op.logFileURLs.error || op.logFileURLs.jsonl)) || null;
        if (logUrl) {
          const a = document.createElement('a');
          a.href = logUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = op.name;
          li.appendChild(a);
        } else {
          const span = document.createElement('span');
          span.textContent = op.name;
          li.appendChild(span);
        }
        ul.appendChild(li);
      }
      div.appendChild(ul);
    }
    phaseGroupsEl.appendChild(div);
  }
}

// Legend ---------------------------------------------------------------
// Reuse the same priority ordering as phase summaries for legend ordering
const legendOrder = [...phaseStatusPriority];
function renderLegend() {
  if (!legendEl) return;
  if (!legendEl._initialized) {
    const header = document.createElement('h4');
    header.textContent = 'Legend';
    // Collapse toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.id = 'legend-collapse-btn';
    toggleBtn.setAttribute('aria-label', 'Collapse legend');
    toggleBtn.style.background = 'transparent';
    toggleBtn.style.border = 'none';
    toggleBtn.style.color = 'var(--text)';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.fontSize = '12px';
    toggleBtn.style.padding = '2px 4px';
    toggleBtn.style.marginLeft = 'auto';
    toggleBtn.style.display = 'flex';
    toggleBtn.style.alignItems = 'center';
    toggleBtn.style.lineHeight = '1';
    toggleBtn.textContent = '−';
    header.appendChild(toggleBtn);
    legendEl.appendChild(header);
    legendEl._initialized = true;
    // Restore collapsed state
    const collapsed = window.localStorage.getItem('rushServeLegendCollapsed') === '1';
    if (collapsed) legendEl.classList.add('collapsed');
    toggleBtn.textContent = collapsed ? '+' : '−';
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggleBtn.addEventListener('click', () => {
      const isCollapsed = legendEl.classList.toggle('collapsed');
      window.localStorage.setItem('rushServeLegendCollapsed', isCollapsed ? '1' : '0');
      toggleBtn.textContent = isCollapsed ? '+' : '−';
      toggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand legend' : 'Collapse legend');
      toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      // Re-render to hide/show content
      renderLegend();
    });
  }
  while (legendEl.children.length > 1) legendEl.removeChild(legendEl.lastChild);
  const collapsedNow = legendEl.classList.contains('collapsed');
  if (collapsedNow) {
    // Minimal stub when collapsed
    const stub = document.createElement('div');
    stub.style.fontSize = '0.5rem';
    stub.style.opacity = '0.7';
    stub.textContent = 'Collapsed';
    legendEl.appendChild(stub);
    return;
  }
  const columnsWrap = document.createElement('div');
  columnsWrap.className = 'legend-columns';
  // Primary column: core execution statuses
  const colPrimary = document.createElement('div');
  colPrimary.className = 'legend-col';
  const primaryHead = document.createElement('div');
  primaryHead.className = 'legend-heading';
  primaryHead.textContent = 'Statuses';
  colPrimary.appendChild(primaryHead);
  for (const status of legendOrder) {
    const row = document.createElement('div');
    row.className = 'legend-row';
    const sample = document.createElement('span');
    sample.className = 'legend-emoji';
    sample.textContent = statusEmoji(status);
    sample.style.borderColor = statusColors[status] || '#4b5563';
    const labelWrap = document.createElement('div');
    labelWrap.className = 'legend-label-wrap';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = overallStatusText(status);
    labelWrap.appendChild(titleSpan);
    row.appendChild(sample);
    row.appendChild(labelWrap);
    colPrimary.appendChild(row);
  }
  // Unknown status (never executed) legend row
  const unknownRow = document.createElement('div');
  unknownRow.className = 'legend-row';
  const unknownSample = document.createElement('span');
  unknownSample.className = 'legend-emoji status-Unknown';
  unknownSample.textContent = '❓';
  unknownSample.style.borderColor = '#4b5563';
  const unknownLabelWrap = document.createElement('div');
  unknownLabelWrap.className = 'legend-label-wrap';
  const unknownTitle = document.createElement('span');
  unknownTitle.textContent = 'UNKNOWN';
  const unknownDetail = document.createElement('small');
  unknownDetail.textContent = 'Never executed';
  unknownLabelWrap.appendChild(unknownTitle);
  unknownLabelWrap.appendChild(unknownDetail);
  unknownRow.appendChild(unknownSample);
  unknownRow.appendChild(unknownLabelWrap);
  colPrimary.appendChild(unknownRow);
  // Secondary column: run/enable/active/filter semantics
  const colSecondary = document.createElement('div');
  colSecondary.className = 'legend-col';
  const secondaryHead = document.createElement('div');
  secondaryHead.className = 'legend-heading';
  secondaryHead.textContent = 'State Modifiers';
  colSecondary.appendChild(secondaryHead);
  function addModifier(sampleFactory, label, detail) {
    const row = document.createElement('div');
    row.className = 'legend-row';
    const sample = sampleFactory();
    const labelWrap = document.createElement('div');
    labelWrap.className = 'legend-label-wrap';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = label;
    labelWrap.appendChild(titleSpan);
    if (detail) {
      const small = document.createElement('small');
      small.textContent = detail;
      labelWrap.appendChild(small);
    }
    row.appendChild(sample);
    row.appendChild(labelWrap);
    colSecondary.appendChild(row);
  }
  // Helper factories
  const makeNodeBox = (borderStyle, boxShadow, borderColor) => {
    const span = document.createElement('span');
    span.className = 'legend-emoji';
    if (borderStyle) span.style.borderStyle = borderStyle;
    if (borderColor) span.style.borderColor = borderColor;
    if (boxShadow) span.style.boxShadow = boxShadow;
    span.textContent = ' '; // visual box only
    return span;
  };
  const makeQueued = () => makeNodeBox(null, '0 0 0 2px var(--warn) inset', 'var(--warn)');
  const makeDashed = () => {
    const s = makeNodeBox('dashed');
    return s;
  };
  const makeDotted = () => {
    const s = makeNodeBox('dotted');
    return s;
  };
  const makeActive = () => {
    const wrap = document.createElement('div');
    wrap.className = 'legend-enabled-sample';
    const base = document.createElement('span');
    base.style.opacity = '0.15';
    base.style.fontSize = '11px';
    base.textContent = '⬜';
    wrap.appendChild(base);
    const rocket = document.createElement('span');
    rocket.style.position = 'absolute';
    rocket.style.bottom = '0';
    rocket.style.left = '0';
    rocket.style.transform = 'translate(-50%, 50%)';
    rocket.style.fontSize = '12px';
    rocket.textContent = '⚡';
    wrap.appendChild(rocket);
    return wrap;
  };
  const makePending = () => {
    const wrap = document.createElement('div');
    wrap.className = 'legend-enabled-sample';
    const base = document.createElement('span');
    base.style.opacity = '0.15';
    base.style.fontSize = '11px';
    base.textContent = '⬜';
    wrap.appendChild(base);
    const clock = document.createElement('span');
    clock.style.position = 'absolute';
    clock.style.top = '0';
    clock.style.left = '0';
    clock.style.transform = 'translate(-50%, -50%)';
    clock.style.fontSize = '12px';
    clock.textContent = '🕒';
    wrap.appendChild(clock);
    return wrap;
  };
  const makeEnabledSample = (emoji) => {
    const wrap = document.createElement('div');
    wrap.className = 'legend-enabled-sample';
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = emoji;
    wrap.appendChild(sub);
    return wrap;
  };
  addModifier(makePending, 'Pending changes', 'Iteration queued');
  addModifier(makeActive, 'Active', 'In-memory state');
  addModifier(makeDashed, 'Not in this iteration', 'Excluded this iteration');
  addModifier(makeDotted, 'Filtered out', 'Hidden by view/search');
  // Enabled state grouping heading
  const enabledHead = document.createElement('div');
  enabledHead.className = 'legend-subheading';
  enabledHead.textContent = 'Enabled States';
  colSecondary.appendChild(enabledHead);
  addModifier(() => makeEnabledSample('🟢'), 'Enabled', 'Runs normally');
  addModifier(() => makeEnabledSample('🟡'), 'Ignore dependency changes', 'Skips if no local changes');
  addModifier(() => makeEnabledSample('🔴'), 'Disabled', 'Never runs');
  addModifier(() => makeEnabledSample('⚪'), 'No-op', 'Operation does no work');
  columnsWrap.appendChild(colPrimary);
  columnsWrap.appendChild(colSecondary);
  legendEl.appendChild(columnsWrap);
}

const statusEmojiMap = {
  Ready: '⏸️',
  Waiting: '🕘',
  Queued: '📝',
  Executing: '⚙️',
  Success: '✅',
  SuccessWithWarning: '⚠️',
  Skipped: '💤',
  FromCache: '🟩',
  Failure: '❌',
  Blocked: '🚫',
  NoOp: '💤',
  Aborted: '🛑',
  Disconnected: '⏸️',
  Unknown: '❓'
};
function statusEmoji(status) {
  return statusEmojiMap[status] || '•';
}

// Table sorting
// (Removed old sortable column logic; pivoted view handles selection differently.)

// Action buttons
document.getElementById('connect-btn').addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    disconnect();
  } else {
    connect();
  }
});
document
  .getElementById('invalidate-btn')
  .addEventListener('click', () =>
    sendCommand({ command: 'invalidate', operationNames: Array.from(selection) })
  );
document
  .getElementById('close-runners-btn')
  .addEventListener('click', () =>
    sendCommand({ command: 'close-runners', operationNames: Array.from(selection) })
  );
const expandDepsBtn = document.getElementById('expand-deps-btn');
if (expandDepsBtn) expandDepsBtn.addEventListener('click', expandSelectionDependencies);
const expandConsumersBtn = document.getElementById('expand-consumers-btn');
if (expandConsumersBtn) expandConsumersBtn.addEventListener('click', expandSelectionConsumers);
const setEnabledDefaultBtn = document.getElementById('set-enabled-default-btn');
const setEnabledIgnoreDepsBtn = document.getElementById('set-enabled-ignore-deps-btn');
const setEnabledDisabledBtn = document.getElementById('set-enabled-disabled-btn');
const selectionModeBtn = document.getElementById('selection-mode-btn');
let selectionEnableMode = 'safe'; // 'safe' | 'unsafe'
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
function sendEnableState(targetState) {
  if (!selection.size) return;
  sendCommand({
    command: 'set-enabled-states',
    operationNames: Array.from(selection),
    targetState,
    mode: selectionEnableMode
  });
}
if (setEnabledDefaultBtn) setEnabledDefaultBtn.addEventListener('click', () => sendEnableState('affected'));
if (setEnabledIgnoreDepsBtn)
  setEnabledIgnoreDepsBtn.addEventListener('click', () => sendEnableState('ignore-dependency-changes'));
if (setEnabledDisabledBtn) setEnabledDisabledBtn.addEventListener('click', () => sendEnableState('never'));
document.getElementById('execute-btn').addEventListener('click', () => sendCommand({ command: 'execute' }));
document
  .getElementById('abort-execution-btn')
  .addEventListener('click', () => sendCommand({ command: 'abort-execution' }));
document.getElementById('clear-selection-btn').addEventListener('click', () => {
  if (selection.size) {
    selection.clear();
    render();
  }
});
debugBtn.addEventListener('click', () => {
  const newVal = !graphSettings?.debugMode;
  // Optimistic UI update
  debugBtn.title = newVal ? 'Turn off debug logging' : 'Turn on debug logging';
  sendCommand({ command: 'set-debug', value: newVal });
});
verboseBtn.addEventListener('click', () => {
  const newVal = !graphSettings?.verbose;
  verboseBtn.title = newVal ? 'Turn off verbose logging' : 'Turn on verbose logging';
  sendCommand({ command: 'set-verbose', value: newVal });
});
parallelismInput.addEventListener('change', () =>
  sendCommand({ command: 'set-parallelism', parallelism: Number(parallelismInput.value) || 1 })
);
playPauseBtn.addEventListener('click', () => {
  if (!graphSettings) return;
  const next = !!graphSettings.pauseNextIteration; // current boolean
  // Toggle: if currently paused (true), set to false (resume automatic); otherwise set to true (pause)
  sendCommand({ command: 'set-pause-next-iteration', value: !next });
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    selection = new Set(Array.from(operations.keys()));
    render();
  }
  if (e.key === 'Escape') {
    if (selection.size) {
      selection.clear();
      render();
    }
  }
});
// (Dynamic legend offset removed; static CSS handles scrollbar clearance.)

// objFromSelection removed (replaced by sendEnableState helper for new API)

// expose for debug
window.__rushServeDemo = { operations, selection };
updateDerivedUrlDisplay();

// View toggle & filter handlers
document.querySelectorAll('input[name="view"]').forEach((r) => {
  r.addEventListener('change', () => {
    if (r.checked) {
      currentView = r.value;
      document.getElementById('left').style.display = currentView === 'table' ? '' : 'none';
      document.getElementById('right').style.display = currentView === 'graph' ? '' : 'none';
      syncUrlFromState();
      render();
    }
  });
});
document.getElementById('filter-select').addEventListener('change', (e) => {
  currentFilter = e.target.value;
  // Filter change requires full rebuild of graph
  markGraphDirty();
  syncUrlFromState();
  render();
});
const nameSearchInput = document.getElementById('name-search');
nameSearchInput.addEventListener('input', () => {
  searchQuery = nameSearchInput.value;
  // Table re-render always; graph full rebuild (layout may shrink) when search changes.
  markGraphDirty();
  render();
});
// Initialize visibility states
// Apply loaded state to controls (radio + filter)
const viewRadio = document.querySelector(`input[name="view"][value="${currentView}"]`);
if (viewRadio) viewRadio.checked = true;
const filterSelect = document.getElementById('filter-select');
if (filterSelect) filterSelect.value = currentFilter;
document.getElementById('left').style.display = currentView === 'table' ? '' : 'none';
document.getElementById('right').style.display = currentView === 'graph' ? '' : 'none';
syncUrlFromState();
// Auto-connect on load
updateDerivedUrlDisplay();
connect();
