// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import './styles/global.css';

import {
  applyExecutionStates as applyExecutionStatesMutation,
  patchOperationsFromPayload,
  setOperationsFromPayload,
  setQueuedStates,
  toLastExecutionResultsMap
} from './modules/dashboardMutations';
import {
  computeWsUrl as computeWebSocketUrl,
  overallStatusText,
  setConnected as setTopBarConnected,
  showConnectingStatus,
  updateDerivedUrlDisplay as updateTopBarDerivedUrlDisplay,
  updateManagerState as updateTopBarManagerState,
  updateStatusPill as updateTopBarStatusPill,
  type ITopBarRefs
} from './modules/topBar';
import { createTerminalPaneController, type ITerminalPaneController } from './modules/terminalPane';
import { createDashboardWebSocketController } from './modules/dashboardWebSocket';
import { computeFilterSetsCore } from './modules/graphFiltering';
import { createGraphViewController, graphState } from './modules/graphView';
import { createGraphSelectionController } from './modules/graphSelection';
import { createSelectionBarController } from './modules/selectionBar';
import { createTableViewController } from './modules/tableView';
import { createPhaseLegendController } from './modules/phaseLegend';
import { wireLeftBarActions } from './modules/leftBar';
import { wireMainBarActions } from './modules/mainBar';
import { wireViewBar } from './modules/viewBar';
import { loadDashboardUrlState, type DashboardFilter, type DashboardView } from './modules/urlState';
import {
  buildRunPolicyText,
  buildTooltip,
  computeDisplayStatus as computeDisplayStatusCore,
  enabledGlyph,
  getStatusColors,
  statusEmoji
} from './modules/statusHelpers';

interface IOperationLogFileURLs {
  text?: string;
  error?: string;
  jsonl?: string;
}

interface IOperationInfo {
  name: string;
  dependencies?: string[];
  phaseName?: string;
  packageName?: string;
  noop?: boolean;
  enabled?: string;
  status?: string;
  runInThisIteration?: boolean;
  isActive?: boolean;
  logFileURLs?: IOperationLogFileURLs;
}

interface IOperationExecutionState {
  name: string;
  status?: string;
  runInThisIteration?: boolean;
  isActive?: boolean;
  logFileURLs?: IOperationLogFileURLs;
}

interface IDashboardGraphState {
  status?: string;
  debugMode?: boolean;
  verbose?: boolean;
  pauseNextIteration?: boolean;
  parallelism?: number | string;
  hasScheduledIteration?: boolean;
}

interface IDashboardSessionInfo {
  actionName: string;
  repositoryIdentifier: string;
}

interface IDashboardMessage {
  event: string;
  operations?: IOperationInfo[];
  currentExecutionStates?: IOperationExecutionState[];
  executionStates?: IOperationExecutionState[];
  queuedStates?: IOperationExecutionState[];
  graphState?: IDashboardGraphState;
  resultByOperation?: IOperationExecutionState[];
  status?: string;
  sessionInfo?: IDashboardSessionInfo;
  kind?: string;
  text?: string;
}

interface IGraphViewControllerLike {
  markGraphDirty(): void;
  ensureGraph(): void;
  updateGraph(): void;
}

const statusPill: HTMLElement = document.getElementById('status-pill') as HTMLElement;
const statusEmojiEl: HTMLElement = document.getElementById('status-emoji') as HTMLElement;
const connectBtn: HTMLButtonElement | undefined =
  (document.getElementById('connect-btn') as HTMLButtonElement | null) ?? undefined;
const appTitleEl: HTMLElement | undefined = document.getElementById('app-title') ?? undefined;
const tableEl: HTMLTableElement = document.getElementById('operations-table') as HTMLTableElement;
const tableHead: HTMLTableSectionElement | undefined = tableEl.querySelector('thead') ?? undefined;
const tableBody: HTMLTableSectionElement | undefined = tableEl.querySelector('tbody') ?? undefined;
const tableStats: HTMLElement | undefined = document.getElementById('table-stats') ?? undefined;
const managerStateEl: HTMLElement | undefined = document.getElementById('graph-state') ?? undefined;
const edgesSvg: SVGSVGElement | undefined = document.querySelector<SVGSVGElement>('svg#edges') ?? undefined;
if (!edgesSvg) {
  throw new Error('The graph edges SVG element was not found.');
}
const graphEl: HTMLElement = document.getElementById('graph') as HTMLElement;
const legendEl: HTMLElement | undefined = document.getElementById('graph-legend') ?? undefined;
const phaseGroupsEl: HTMLElement | undefined = document.getElementById('phase-groups') ?? undefined;
const playPauseBtn: HTMLButtonElement | undefined =
  (document.getElementById('play-pause-btn') as HTMLButtonElement | null) ?? undefined;
const parallelismInput: HTMLInputElement | undefined =
  (document.getElementById('parallelism-input') as HTMLInputElement | null) ?? undefined;
const debugBtn: HTMLButtonElement | undefined =
  (document.getElementById('debug-btn') as HTMLButtonElement | null) ?? undefined;
const verboseBtn: HTMLButtonElement | undefined =
  (document.getElementById('verbose-btn') as HTMLButtonElement | null) ?? undefined;
const terminalEl: HTMLElement | undefined = document.getElementById('terminal') ?? undefined;
const terminalBody: HTMLElement | undefined = document.getElementById('terminal-body') ?? undefined;
const termClearBtn: HTMLButtonElement | undefined =
  (document.getElementById('term-clear-btn') as HTMLButtonElement | null) ?? undefined;
const termAutoScroll: HTMLInputElement | undefined =
  (document.getElementById('term-autoscroll') as HTMLInputElement | null) ?? undefined;
const termAutoscrollBtn: HTMLButtonElement | undefined =
  (document.getElementById('term-autoscroll-btn') as HTMLButtonElement | null) ?? undefined;
const toggleTerminalBtn: HTMLButtonElement | undefined =
  (document.getElementById('toggle-terminal-btn') as HTMLButtonElement | null) ?? undefined;
const resizerEl: HTMLElement | undefined = document.getElementById('resizer') ?? undefined;

const terminalPane: ITerminalPaneController = createTerminalPaneController({
  terminalEl,
  terminalBody,
  termClearBtn,
  termAutoScrollCheckbox: termAutoScroll,
  termAutoscrollBtn,
  toggleTerminalBtn,
  resizerEl
});

const topBarRefs: ITopBarRefs = {
  connectBtn,
  statusPill,
  statusEmojiEl,
  debugBtn,
  verboseBtn,
  playPauseBtn,
  parallelismInput,
  managerStateEl
};

const disabledControlIds: string[] = [
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
];

const operations: Map<string, IOperationInfo> = new Map();
const executionStates: Map<string, IOperationExecutionState> = new Map();
const queuedStates: Map<string, IOperationExecutionState> = new Map();
let lastExecutionResults: Map<string, IOperationExecutionState> = new Map();
let selection: Set<string> = new Set();
let graphSettings: IDashboardGraphState | undefined;
let currentView: DashboardView = 'table';
let currentFilter: DashboardFilter = 'all';
let searchQuery: string = '';
let filteredOutNames: Set<string> = new Set();
let searchFilteredOutNames: Set<string> = new Set();

function computeDisplayStatus(op: IOperationInfo): string {
  return computeDisplayStatusCore(op, executionStates, lastExecutionResults);
}

function computeVisibleOperations(): IOperationInfo[] {
  const result: ReturnType<typeof computeFilterSetsCore> = computeFilterSetsCore({
    operations,
    executionStates,
    currentFilter,
    searchQuery,
    computeDisplayStatus
  });
  filteredOutNames = result.filteredOutNames;
  searchFilteredOutNames = result.searchFilteredOutNames;
  return result.visibleOperations;
}

const tableViewController: ReturnType<typeof createTableViewController> = createTableViewController({
  tableHead: tableHead || undefined,
  tableBody: tableBody || undefined,
  tableStats: tableStats || undefined,
  getOperations: () => operations,
  getFilteredOperations: () => computeVisibleOperations(),
  getSelection: () => selection,
  setSelection: (nextSelection: Set<string>) => {
    selection = nextSelection;
  },
  onSelectionMutated: () => {
    updateSelectionUI();
    render();
  },
  computeDisplayStatus,
  enabledGlyph,
  buildRunPolicyText,
  buildTooltip,
  statusEmoji,
  overallStatusText
});

const phaseLegendController: ReturnType<typeof createPhaseLegendController> = createPhaseLegendController({
  phaseGroupsEl: phaseGroupsEl || undefined,
  legendEl: legendEl || undefined,
  getOperations: () => operations,
  getGraphVisibleNames: () =>
    graphState.nodePositions.size ? new Set(graphState.nodePositions.keys()) : undefined,
  computeDisplayStatus,
  statusEmoji,
  overallStatusText,
  getStatusColors
});

function selectionChanged(): void {
  updateSelectionUI();
  render();
}

const graphSelectionController: ReturnType<typeof createGraphSelectionController> =
  createGraphSelectionController({
    graphEl,
    getCurrentView: () => currentView,
    getSelection: () => selection,
    setSelection: (nextSelection: Set<string>) => {
      selection = nextSelection;
    },
    getOperations: () => operations,
    getGraphNodePositions: () => graphState.nodePositions,
    graphNodeWidth: 28,
    graphNodeHeight: 28,
    onSelectionChanged: selectionChanged,
    onLiveSelectionChanged: updateGraph
  });

function singleSelect(name: string): void {
  graphSelectionController.singleSelect(name);
}

function toggleSelect(name: string): void {
  graphSelectionController.toggleSelect(name);
}

const graphViewController: IGraphViewControllerLike = createGraphViewController({
  graphEl,
  edgesSvg,
  getOperations: () => operations,
  getExecutionStates: () => executionStates,
  getQueuedStates: () => queuedStates,
  getSelection: () => selection,
  getFilteredOutNames: () => filteredOutNames,
  getSearchFilteredOutNames: () => searchFilteredOutNames,
  getLastExecutionResults: () => lastExecutionResults,
  getComputeDisplayStatus: computeDisplayStatus,
  getStatusEmoji: statusEmoji,
  getOverallStatusText: overallStatusText,
  renderPhaseLegend: () => phaseLegendController.renderAll(),
  singleSelect,
  toggleSelect
});

graphSelectionController.wireGraphMarqueeSelection();

function markGraphDirty(): void {
  graphViewController.markGraphDirty();
  if (currentView === 'graph') {
    ensureGraph();
  }
}

function ensureGraph(): void {
  graphViewController.ensureGraph();
}

function updateGraph(): void {
  graphViewController.updateGraph();
}

function renderTable(): void {
  tableViewController.renderTable();
}

function render(): void {
  if (currentView === 'table') {
    renderTable();
  } else {
    ensureGraph();
  }
  updateSelectionUI();
}

function setConnected(connected: boolean): void {
  setTopBarConnected(topBarRefs, connected, updateSelectionUI, disabledControlIds);
}

function updateDerivedUrlDisplay(): void {
  updateTopBarDerivedUrlDisplay(connectBtn);
}

function updateManagerState(): void {
  if (!graphSettings) return;
  updateTopBarManagerState(topBarRefs, graphSettings);
}

function log(message: string): void {
  const time: string = new Date().toLocaleTimeString();
  window.console.log('[' + time + '] ' + message);
}

const socketController: ReturnType<typeof createDashboardWebSocketController> =
  createDashboardWebSocketController({
    getUrl: () => computeWebSocketUrl(window.location),
    onConnecting: () => {
      showConnectingStatus(statusPill, statusEmojiEl, statusEmoji);
    },
    onConnectedStateChange: (connected: boolean) => {
      setConnected(connected);
    },
    onOpen: () => {
      updateStatusPill();
    },
    onClose: () => {
      updateStatusPill();
    },
    onError: (event: Event) => {
      log('WebSocket error: ' + event.type);
    },
    onParsedMessage: (message: unknown) => {
      handleMessage(message as IDashboardMessage);
    },
    onParseError: (error: unknown) => {
      log('Bad JSON: ' + String(error));
    },
    onLog: log
  });

function updateStatusPill(): void {
  updateTopBarStatusPill(topBarRefs, socketController.getSocket(), graphSettings, statusEmoji);
}

const selectionBarController: ReturnType<typeof createSelectionBarController> = createSelectionBarController({
  getSelection: () => selection,
  getCurrentView: () => currentView,
  isConnected: () => socketController.isConnected()
});

function connect(): void {
  socketController.connect();
}

function disconnect(): void {
  socketController.disconnect();
}

function sendCommand(cmd: unknown): void {
  socketController.sendCommand(cmd);
}

function handleMessage(msg: IDashboardMessage): void {
  switch (msg.event) {
    case 'sync': {
      setOperationsFromPayload(operations, msg.operations || []);
      executionStates.clear();
      applyExecutionStatesMutation(operations, executionStates, msg.currentExecutionStates || []);
      setQueuedStates(queuedStates, msg.queuedStates || []);
      graphSettings = msg.graphState;
      lastExecutionResults = toLastExecutionResultsMap(msg.resultByOperation || []);
      if (appTitleEl && msg.sessionInfo) {
        const title: string = `${msg.sessionInfo.actionName} — ${msg.sessionInfo.repositoryIdentifier}`;
        appTitleEl.textContent = title;
        document.title = title;
      }
      markGraphDirty();
      break;
    }
    case 'sync-operations': {
      patchOperationsFromPayload(operations, msg.operations || []);
      markGraphDirty();
      break;
    }
    case 'sync-graph-state': {
      graphSettings = msg.graphState;
      break;
    }
    case 'iteration-scheduled': {
      setQueuedStates(queuedStates, msg.queuedStates || []);
      break;
    }
    case 'before-execute':
    case 'status-change': {
      applyExecutionStatesMutation(operations, executionStates, msg.executionStates || []);
      break;
    }
    case 'after-execute': {
      applyExecutionStatesMutation(operations, executionStates, msg.executionStates || []);
      lastExecutionResults = toLastExecutionResultsMap(msg.resultByOperation || []);
      if (graphSettings && msg.status) {
        graphSettings.status = msg.status;
      }
      break;
    }
    case 'terminal-chunk': {
      terminalPane.appendChunk(msg.kind, msg.text);
      break;
    }
  }

  updateManagerState();
  updateStatusPill();
  render();
}

function updateSelectionUI(): void {
  selectionBarController.updateSelectionUI();
}

function expandSelectionDependencies(): void {
  graphSelectionController.expandSelectionDependencies();
}

function expandSelectionConsumers(): void {
  graphSelectionController.expandSelectionConsumers();
}

function wireActions(): void {
  wireMainBarActions({
    connect,
    disconnect,
    isConnected: () => socketController.isConnected(),
    sendCommand,
    getGraphSettings: () => graphSettings,
    debugBtn,
    verboseBtn,
    parallelismInput,
    playPauseBtn,
    getOperationNames: () => Array.from(operations.keys()),
    setSelection: (nextSelection: Set<string>) => {
      selection = nextSelection;
    },
    clearSelection: () => {
      selection.clear();
    },
    hasSelection: () => selection.size > 0,
    render
  });

  wireLeftBarActions({
    sendCommand,
    getSelection: () => selection,
    clearSelectionAndRender: () => {
      if (!selection.size) return;
      selection.clear();
      render();
    },
    expandSelectionDependencies,
    expandSelectionConsumers
  });

  wireViewBar({
    getView: () => currentView,
    setView: (nextView: DashboardView) => {
      currentView = nextView;
    },
    getFilter: () => currentFilter,
    setFilter: (nextFilter: DashboardFilter) => {
      currentFilter = nextFilter;
    },
    setSearchQuery: (nextSearchQuery: string) => {
      searchQuery = nextSearchQuery;
    },
    markGraphDirty,
    render
  });
}
function init(): void {
  const urlState: ReturnType<typeof loadDashboardUrlState> = loadDashboardUrlState(window.location.search);
  currentView = urlState.view;
  currentFilter = urlState.filter;

  wireActions();
  updateDerivedUrlDisplay();
  updateSelectionUI();
  updateManagerState();
  updateStatusPill();
  connect();
  (
    window as Window & {
      __rushServeDemo?: { operations: Map<string, IOperationInfo>; selection: Set<string> };
    }
  ).__rushServeDemo = {
    operations,
    selection
  };
}

init();
