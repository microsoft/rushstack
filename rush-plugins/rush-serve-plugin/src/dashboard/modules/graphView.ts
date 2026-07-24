// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable @typescript-eslint/typedef */

import { pruneGraphOperations } from './graphFiltering';

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

export interface IPoint {
  x: number;
  y: number;
}

export interface IGraphEdgeRecord {
  path: SVGPathElement;
  from: string;
  to: string;
}

export interface IGraphState {
  nodePositions: Map<string, IPoint>;
  nodeStatus: Map<string, string>;
  nodeElements: Map<string, HTMLDivElement>;
  edgeElements: IGraphEdgeRecord[];
}

export const GRAPH_NODE_WIDTH: number = 28;
export const GRAPH_NODE_HEIGHT: number = 28;
export const GRAPH_COL_WIDTH: number = 46;
export const GRAPH_NODE_GAP: number = 10;
export const GRAPH_LEVEL_GAP: number = 70;
export const GRAPH_BASE_X: number = 16;
export const GRAPH_BASE_Y: number = 16;

export const graphState: IGraphState = {
  nodePositions: new Map<string, IPoint>(),
  nodeStatus: new Map<string, string>(),
  nodeElements: new Map<string, HTMLDivElement>(),
  edgeElements: []
};

export interface IGraphViewControllerOptions {
  graphEl: HTMLElement;
  edgesSvg: SVGSVGElement;
  getOperations: () => Map<string, IOperationInfo>;
  getExecutionStates: () => Map<string, IOperationExecutionState>;
  getQueuedStates: () => Map<string, IOperationExecutionState>;
  getSelection: () => Set<string>;
  getFilteredOutNames: () => Set<string>;
  getSearchFilteredOutNames: () => Set<string>;
  getLastExecutionResults: () => Map<string, IOperationExecutionState>;
  getComputeDisplayStatus: (op: IOperationInfo) => string;
  getStatusEmoji: (status: string) => string;
  getOverallStatusText: (status: string | undefined) => string;
  renderPhaseLegend: () => void;
  singleSelect: (name: string) => void;
  toggleSelect: (name: string) => void;
}

export interface IGraphViewController {
  markGraphDirty(): void;
  ensureGraph(): void;
  updateGraph(): void;
}

export function createGraphViewController(options: IGraphViewControllerOptions): IGraphViewController {
  let graphNeedsFullRender: boolean = true;
  function getStatusColors(): Record<string, string> {
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

  let statusColors: Record<string, string> = getStatusColors();

  const mo = new MutationObserver(() => {
    statusColors = getStatusColors();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

  const updateStatusColors = (): void => {
    statusColors = getStatusColors();
  };

  function computeLevels(filteredOps: IOperationInfo[]): Map<string, number> {
    const indegree: Map<string, number> = new Map<string, number>();
    const deps: Map<string, string[]> = new Map<string, string[]>();
    filteredOps.forEach((op: IOperationInfo) => {
      deps.set(op.name, op.dependencies || []);
      indegree.set(op.name, (op.dependencies || []).length);
    });

    const queue: string[] = [];
    indegree.forEach((v: number, k: string) => {
      if (v === 0) queue.push(k);
    });

    const level: Map<string, number> = new Map<string, number>();
    queue.forEach((k: string) => level.set(k, 0));

    while (queue.length) {
      const cur = queue.shift();
      if (!cur) continue;
      const curLevel = level.get(cur) || 0;
      filteredOps.forEach((op: IOperationInfo) => {
        if ((op.dependencies || []).includes(cur)) {
          indegree.set(op.name, (indegree.get(op.name) || 0) - 1);
          if (!level.has(op.name) || (level.get(op.name) || 0) < curLevel + 1) {
            level.set(op.name, curLevel + 1);
          }
          if ((indegree.get(op.name) || 0) === 0) queue.push(op.name);
        }
      });
    }

    return level;
  }

  function computeGraphOperations(): IOperationInfo[] {
    const filteredOutNames = options.getFilteredOutNames();
    const searchFilteredOutNames = options.getSearchFilteredOutNames();
    const visibleOperations: IOperationInfo[] = [];

    for (const op of options.getOperations().values()) {
      if (filteredOutNames.has(op.name)) continue;
      if (searchFilteredOutNames.has(op.name)) continue;
      visibleOperations.push(op);
    }

    return pruneGraphOperations(visibleOperations);
  }

  function dimColor(hex: string, amount = 0.55): string {
    if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) return hex || '#4b5563';
    if (hex[0] === '#') hex = hex.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const br = 30;
    const bg = 41;
    const bb = 59;
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

  function buildGraph(): void {
    graphState.nodePositions.clear();
    graphState.nodeStatus.clear();
    graphState.nodeElements.forEach((el) => el.remove());
    graphState.nodeElements.clear();
    graphState.edgeElements.forEach((e: IGraphEdgeRecord) => e.path.remove());
    graphState.edgeElements.length = 0;

    options.edgesSvg.innerHTML =
      '<defs>' +
      Object.entries(statusColors)
        .map(
          ([status, color]) =>
            `<marker id="arrowhead-${status}" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${color}" /></marker>`
        )
        .join('') +
      '</defs>';

    const filteredOpsArr: IOperationInfo[] = computeGraphOperations();
    const level: Map<string, number> = computeLevels(filteredOpsArr);
    const groups: Record<number, string[]> = {};
    level.forEach((value: number, name: string) => (groups[value] ||= []).push(name));
    const sortedLevels: number[] = Object.keys(groups)
      .map(Number)
      .sort((a, b) => a - b);
    const maxLevel: number = sortedLevels.length ? Math.max(...sortedLevels) : 0;

    const dependentsMap: Map<string, Set<string>> = new Map<string, Set<string>>();
    filteredOpsArr.forEach((op: IOperationInfo) => {
      (op.dependencies || []).forEach((dependencyName: string) => {
        if (!options.getOperations().has(dependencyName)) return;
        let setForDependency = dependentsMap.get(dependencyName);
        if (!setForDependency) {
          setForDependency = new Set<string>();
          dependentsMap.set(dependencyName, setForDependency);
        }
        setForDependency.add(op.name);
      });
    });

    const byNameFiltered: Map<string, IOperationInfo> = new Map<string, IOperationInfo>(
      filteredOpsArr.map((op) => [op.name, op])
    );
    const memoCpl: Map<string, number> = new Map<string, number>();
    function criticalPathLen(name: string): number {
      const cached = memoCpl.get(name);
      if (cached !== undefined) return cached;
      const op = byNameFiltered.get(name);
      if (!op) {
        memoCpl.set(name, 0);
        return 0;
      }
      const deps: string[] = Array.from(dependentsMap.get(name) || new Set<string>());
      if (!deps.length) {
        memoCpl.set(name, 0);
        return 0;
      }
      let best = 0;
      for (const dependencyName of deps) {
        best = Math.max(best, 1 + criticalPathLen(dependencyName));
      }
      memoCpl.set(name, best);
      return best;
    }

    sortedLevels.forEach((levelValue: number) => {
      const nodes = groups[levelValue] || [];
      nodes.sort((a: string, b: string) => {
        const cplA = criticalPathLen(a);
        const cplB = criticalPathLen(b);
        if (cplA !== cplB) return cplB - cplA;
        const consA = (dependentsMap.get(a) || new Set()).size;
        const consB = (dependentsMap.get(b) || new Set()).size;
        if (consA !== consB) return consB - consA;
        return a.localeCompare(b);
      });

      const levelIndexFromTop: number = maxLevel - levelValue;
      nodes.forEach((name: string, index: number) => {
        const op = options.getOperations().get(name);
        if (!op) return;
        const x = GRAPH_BASE_X + index * (GRAPH_COL_WIDTH + GRAPH_NODE_GAP);
        const y = GRAPH_BASE_Y + levelIndexFromTop * GRAPH_LEVEL_GAP;
        const div = document.createElement('div');
        div.className = 'op-node';
        div.dataset.name = name;
        div.style.transform = `translate(${x}px, ${y}px)`;
        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'emoji';
        emojiSpan.textContent = options.getStatusEmoji(options.getComputeDisplayStatus(op));
        div.appendChild(emojiSpan);
        const enabledSup = document.createElement('span');
        enabledSup.className = 'enabled-indicator';
        enabledSup.textContent = '';
        div.appendChild(enabledSup);
        div.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.metaKey || e.ctrlKey) options.toggleSelect(name);
          else options.singleSelect(name);
        });
        options.graphEl.appendChild(div);
        graphState.nodePositions.set(name, { x, y });
        graphState.nodeElements.set(name, div);
      });
    });

    const byName: Map<string, IOperationInfo> = new Map<string, IOperationInfo>(
      filteredOpsArr.map((op) => [op.name, op])
    );
    const memoReach: Map<string, Set<string>> = new Map<string, Set<string>>();
    function getReachable(name: string): Set<string> {
      const cached = memoReach.get(name);
      if (cached) return cached;
      const op = byName.get(name);
      const visited: Set<string> = new Set<string>();
      if (op) {
        const stack: string[] = [...(op.dependencies || [])];
        while (stack.length) {
          const dependencyName = stack.pop();
          if (!dependencyName) continue;
          if (visited.has(dependencyName)) continue;
          visited.add(dependencyName);
          const dependencyOp = byName.get(dependencyName);
          if (dependencyOp) stack.push(...(dependencyOp.dependencies || []));
        }
      }
      memoReach.set(name, visited);
      return visited;
    }

    const edgeRecords: IGraphEdgeRecord[] = [];
    for (const op of filteredOpsArr) {
      const deps = op.dependencies || [];
      for (const depName of deps) {
        if (!byName.has(depName)) continue;
        let redundant = false;
        for (const intermediate of deps) {
          if (intermediate === depName) continue;
          if (!byName.has(intermediate)) continue;
          if (getReachable(intermediate).has(depName)) {
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
        options.edgesSvg.appendChild(path);
      }
    }
    graphState.edgeElements = edgeRecords;
    updateGraph();

    if (graphState.nodePositions.size) {
      const maxX =
        Math.max(...Array.from(graphState.nodePositions.values()).map((p) => p.x)) + GRAPH_NODE_WIDTH + 40;
      const maxY =
        Math.max(...Array.from(graphState.nodePositions.values()).map((p) => p.y)) +
        GRAPH_LEVEL_GAP +
        GRAPH_NODE_HEIGHT;
      options.edgesSvg.setAttribute('width', String(maxX));
      options.edgesSvg.setAttribute('height', String(maxY));
    }
  }

  function updateGraph(): void {
    updateStatusColors();
    for (const [name, div] of graphState.nodeElements.entries()) {
      const op = options.getOperations().get(name);
      if (!op) continue;
      const displayStatus = options.getComputeDisplayStatus(op);
      const prevStatus = graphState.nodeStatus.get(name);
      const state = options.getExecutionStates().get(name);
      const runInThisIteration = state ? state.runInThisIteration : op.runInThisIteration;
      const notRunning = runInThisIteration === false || op.noop;
      const queuedState = options.getQueuedStates().get(name);
      const isQueuedNext = !!(queuedState && queuedState.runInThisIteration === true);
      const isFilteredOut = options.getFilteredOutNames().has(name);
      const isSearchFiltered = options.getSearchFilteredOutNames().has(name);
      const emojiSpan = div.querySelector('.emoji');
      if (emojiSpan && (prevStatus !== displayStatus || !emojiSpan.textContent)) {
        emojiSpan.textContent = options.getStatusEmoji(displayStatus);
      }
      const enabledSpan = div.querySelector('.enabled-indicator') as HTMLSpanElement | null;
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
      if (isSearchFiltered) baseColor = dimColor(baseColor, 0.72);
      else if (isFilteredOut) baseColor = dimColor(baseColor, 0.6);
      else if (notRunning) baseColor = dimColor(baseColor, 0.35);
      div.style.borderColor = baseColor;
      if (options.getSelection().has(name)) div.classList.add('selected');
      else div.classList.remove('selected');
      let activeSpan = div.querySelector('.active-indicator') as HTMLSpanElement | null;
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
      let pendingSpan = div.querySelector('.pending-indicator') as HTMLSpanElement | null;
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
      div.classList.remove('not-running', 'filtered-out', 'filtered-out-search', 'dashed', 'dotted');
      if (isSearchFiltered) {
        div.classList.add('filtered-out-search');
      } else if (isFilteredOut) {
        div.classList.add('filtered-out');
      } else if (notRunning) {
        div.classList.add('not-running');
      }
      div.title = `${op.name}\nLast Result: ${(options.getLastExecutionResults().get(name) || {}).status || displayStatus}\n${options.getOverallStatusText(displayStatus)}${op.isActive ? '\nHas in-memory state' : ''}`;
      graphState.nodeStatus.set(name, displayStatus);
    }

    for (const rec of graphState.edgeElements) {
      const fromPos = graphState.nodePositions.get(rec.from);
      const toPos = graphState.nodePositions.get(rec.to);
      if (!fromPos || !toPos) continue;
      const startX = fromPos.x + GRAPH_NODE_WIDTH / 2;
      const startY = fromPos.y + GRAPH_NODE_HEIGHT;
      const endX = toPos.x + GRAPH_NODE_WIDTH / 2;
      const endY = toPos.y;
      const rowsApart = Math.max(1, Math.round((toPos.y - fromPos.y) / GRAPH_LEVEL_GAP));
      const colStep = GRAPH_COL_WIDTH + GRAPH_NODE_GAP;
      function quadratic(sx: number, sy: number, ex: number, ey: number): string {
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;
        const baseOffset = (ey - sy) / 4;
        return `Q ${sx} ${sy + baseOffset} ${mx} ${my} ${ex} ${my + baseOffset} ${ex} ${ey}`;
      }
      let d = '';
      if (startX === endX && rowsApart === 1) {
        d = `M ${startX} ${startY} L ${endX} ${endY}`;
      } else if (rowsApart === 1) {
        d = `M ${startX} ${startY} ` + quadratic(startX, startY, endX, endY);
      } else {
        const dir = Math.sign(endX - startX) || 1;
        const halfColShift = colStep / 2;
        const candidateX = startX + (endX - startX) * 0.5;
        const deltaCols = Math.max(1, Math.round(Math.abs(endX - startX) / colStep));
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
        const firstTargetY = fromPos.y + GRAPH_LEVEL_GAP;
        const bottomOfRowAboveDest = toPos.y - GRAPH_LEVEL_GAP + GRAPH_NODE_HEIGHT;
        const midY1 = firstTargetY;
        const midY2 = bottomOfRowAboveDest;
        d = `M ${startX} ${startY} ` + quadratic(startX, startY, intermediateX, midY1);
        d += ` L ${intermediateX} ${midY2}`;
        d += ' ' + quadratic(intermediateX, midY2, endX, endY);
      }
      rec.path.setAttribute('d', d);
      const depStatus = graphState.nodeStatus.get(rec.to) || 'Ready';
      rec.path.setAttribute('stroke', statusColors[depStatus] || '#4b5563');
      rec.path.setAttribute('class', 'edge');
      rec.path.setAttribute('marker-end', `url(#arrowhead-${depStatus})`);
      const fromOp = options.getOperations().get(rec.from);
      if (options.getSelection().has(rec.to) && options.getSelection().has(rec.from))
        rec.path.classList.add('highlight');
      else rec.path.classList.remove('highlight');
      rec.path.classList.remove('dashed', 'dotted', 'filtered-out', 'not-running');
      rec.path.classList.remove('filtered-out-search');
      const fromState = fromOp ? options.getExecutionStates().get(rec.from) : undefined;
      const fromRunInThisIteration = fromState ? fromState.runInThisIteration : fromOp?.runInThisIteration;
      const fromNotRunning = fromOp && (fromRunInThisIteration === false || fromOp.noop);
      const edgeStatusFiltered =
        options.getFilteredOutNames().has(rec.from) || options.getFilteredOutNames().has(rec.to);
      const edgeSearchFiltered =
        options.getSearchFilteredOutNames().has(rec.from) || options.getSearchFilteredOutNames().has(rec.to);
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
        rec.path.style.opacity = '';
        const semImportant = depStatus === 'Executing' || depStatus === 'Failure';
        if (!semImportant && !rec.path.classList.contains('highlight')) {
          rec.path.classList.add('dim');
        } else {
          rec.path.classList.remove('dim');
        }
      }
    }

    options.renderPhaseLegend();
  }

  function markGraphDirty(): void {
    graphNeedsFullRender = true;
  }

  function ensureGraph(): void {
    if (graphNeedsFullRender) {
      buildGraph();
      graphNeedsFullRender = false;
    } else {
      updateGraph();
    }
  }

  return {
    markGraphDirty,
    ensureGraph,
    updateGraph
  };
}
