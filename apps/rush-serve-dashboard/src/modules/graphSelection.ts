// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

interface IOperationInfo {
  name: string;
  dependencies?: string[];
}

interface IPoint {
  x: number;
  y: number;
}

export interface IGraphSelectionControllerOptions {
  graphEl: HTMLElement;
  getCurrentView: () => string;
  getSelection: () => Set<string>;
  setSelection: (nextSelection: Set<string>) => void;
  getOperations: () => Map<string, IOperationInfo>;
  getGraphNodePositions: () => Map<string, IPoint>;
  graphNodeWidth: number;
  graphNodeHeight: number;
  onSelectionChanged: () => void;
  onLiveSelectionChanged: () => void;
}

export interface IGraphSelectionController {
  singleSelect: (name: string) => void;
  toggleSelect: (name: string) => void;
  expandSelectionDependencies: () => void;
  expandSelectionConsumers: () => void;
  wireGraphMarqueeSelection: () => void;
}

export function createGraphSelectionController(
  options: IGraphSelectionControllerOptions
): IGraphSelectionController {
  let graphMarqueeEl: HTMLDivElement | null = null;
  let dragSelecting: boolean = false;
  let dragStart: IPoint | null = null;
  let dragLast: IPoint | null = null;
  let preDragSelection: Set<string> | null = null;
  let dragModifierMode: 'replace' | 'add' | 'subtract' = 'replace';

  const _selectionChanged = (): void => {
    options.onSelectionChanged();
  };

  const _graphPointFromEvent = (e: MouseEvent): IPoint => {
    const rect: DOMRect = options.graphEl.getBoundingClientRect();
    return {
      x: e.clientX - rect.left + options.graphEl.scrollLeft,
      y: e.clientY - rect.top + options.graphEl.scrollTop
    };
  };

  const _updateDragModifierMode = (e: MouseEvent | KeyboardEvent): void => {
    if (e.altKey) dragModifierMode = 'subtract';
    else if (e.metaKey || e.ctrlKey || e.shiftKey) dragModifierMode = 'add';
    else dragModifierMode = 'replace';
  };

  const _updateMarquee = (): void => {
    if (!dragSelecting || !graphMarqueeEl || !dragStart || !dragLast) return;

    const x1: number = Math.min(dragStart.x, dragLast.x);
    const y1: number = Math.min(dragStart.y, dragLast.y);
    const x2: number = Math.max(dragStart.x, dragLast.x);
    const y2: number = Math.max(dragStart.y, dragLast.y);

    graphMarqueeEl.style.left = x1 + 'px';
    graphMarqueeEl.style.top = y1 + 'px';
    graphMarqueeEl.style.width = x2 - x1 + 'px';
    graphMarqueeEl.style.height = y2 - y1 + 'px';

    const newlySelected: Set<string> = new Set<string>();
    for (const [name, pos] of options.getGraphNodePositions().entries()) {
      const nx1: number = pos.x;
      const ny1: number = pos.y;
      const nx2: number = pos.x + options.graphNodeWidth;
      const ny2: number = pos.y + options.graphNodeHeight;
      if (nx2 < x1 || nx1 > x2 || ny2 < y1 || ny1 > y2) continue;
      newlySelected.add(name);
    }

    let nextSelection: Set<string>;
    if (dragModifierMode === 'add') {
      nextSelection = new Set(preDragSelection || []);
      newlySelected.forEach((name) => nextSelection.add(name));
    } else if (dragModifierMode === 'subtract') {
      nextSelection = new Set(preDragSelection || []);
      newlySelected.forEach((name) => nextSelection.delete(name));
    } else {
      nextSelection = newlySelected;
    }

    options.setSelection(nextSelection);
    options.onLiveSelectionChanged();
  };

  const _beginDragSelection = (e: MouseEvent): void => {
    if (options.getCurrentView() !== 'graph' || e.button !== 0) return;
    const target: Element | null = e.target as Element | null;
    if (target && target.closest && target.closest('.op-node')) return;

    dragSelecting = true;
    dragStart = _graphPointFromEvent(e);
    dragLast = dragStart;
    preDragSelection = new Set(options.getSelection());
    graphMarqueeEl = document.createElement('div');
    graphMarqueeEl.className = 'graph-marquee';
    options.graphEl.appendChild(graphMarqueeEl);
    _updateMarquee();
    e.preventDefault();
  };

  const _wireGraphMarqueeSelection = (): void => {
    options.graphEl.addEventListener('mousedown', (e: MouseEvent) => {
      _updateDragModifierMode(e);
      _beginDragSelection(e);
    });

    options.graphEl.addEventListener('mousemove', (e: MouseEvent) => {
      if (!dragSelecting) return;
      dragLast = _graphPointFromEvent(e);
      _updateDragModifierMode(e);
      _updateMarquee();
      e.preventDefault();
    });

    window.addEventListener('mouseup', () => {
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

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (dragSelecting) {
        _updateDragModifierMode(e);
        _updateMarquee();
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      if (dragSelecting) {
        _updateDragModifierMode(e);
        _updateMarquee();
      }
    });
  };

  const _singleSelect = (name: string): void => {
    options.setSelection(new Set([name]));
    _selectionChanged();
  };

  const _toggleSelect = (name: string): void => {
    const nextSelection: Set<string> = new Set(options.getSelection());
    if (nextSelection.has(name)) nextSelection.delete(name);
    else nextSelection.add(name);
    options.setSelection(nextSelection);
    _selectionChanged();
  };

  const _expandSelectionDependencies = (): void => {
    const currentSelection: Set<string> = options.getSelection();
    if (!currentSelection.size) return;

    const queue: string[] = [...currentSelection];
    const seen: Set<string> = new Set(currentSelection);
    const operations: Map<string, IOperationInfo> = options.getOperations();

    while (queue.length) {
      const name: string | undefined = queue.shift();
      if (!name) continue;
      const op: IOperationInfo | undefined = operations.get(name);
      if (!op) continue;
      for (const dep of op.dependencies || []) {
        if (!seen.has(dep) && operations.has(dep)) {
          seen.add(dep);
          queue.push(dep);
        }
      }
    }

    if (seen.size !== currentSelection.size) {
      options.setSelection(seen);
      _selectionChanged();
    }
  };

  const _expandSelectionConsumers = (): void => {
    const currentSelection: Set<string> = options.getSelection();
    if (!currentSelection.size) return;

    const operations: Map<string, IOperationInfo> = options.getOperations();
    const dependents: Map<string, Set<string>> = new Map<string, Set<string>>();
    for (const op of operations.values()) {
      for (const dep of op.dependencies || []) {
        if (!operations.has(dep)) continue;
        let setForDep: Set<string> | undefined = dependents.get(dep);
        if (!setForDep) {
          setForDep = new Set<string>();
          dependents.set(dep, setForDep);
        }
        setForDep.add(op.name);
      }
    }

    const queue: string[] = [...currentSelection];
    const seen: Set<string> = new Set(currentSelection);
    while (queue.length) {
      const name: string | undefined = queue.shift();
      if (!name) continue;
      const consumers: Set<string> | undefined = dependents.get(name);
      if (!consumers) continue;
      for (const consumer of consumers) {
        if (!seen.has(consumer)) {
          seen.add(consumer);
          queue.push(consumer);
        }
      }
    }

    if (seen.size !== currentSelection.size) {
      options.setSelection(seen);
      _selectionChanged();
    }
  };

  return {
    singleSelect: _singleSelect,
    toggleSelect: _toggleSelect,
    expandSelectionDependencies: _expandSelectionDependencies,
    expandSelectionConsumers: _expandSelectionConsumers,
    wireGraphMarqueeSelection: _wireGraphMarqueeSelection
  };
}
