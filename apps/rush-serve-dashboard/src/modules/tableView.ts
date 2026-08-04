// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import tableStyles from '../styles/tableView.module.css';

interface ITableAnchorCoordinate {
  row: number;
  phase: number;
}

interface ITablePackageRecord {
  packageName: string;
  byPhase: Map<string, ITableOperation>;
}

interface ITableOperation {
  name: string;
  packageName?: string;
  phaseName?: string;
  isActive?: boolean;
  enabled?: string;
}

export interface ITableViewControllerOptions {
  tableHead: HTMLElement | undefined;
  tableBody: HTMLElement | undefined;
  tableStats: HTMLElement | undefined;
  getOperations: () => Map<string, ITableOperation>;
  getFilteredOperations: () => ITableOperation[];
  getSelection: () => Set<string>;
  setSelection: (nextSelection: Set<string>) => void;
  onSelectionMutated: () => void;
  computeDisplayStatus: (op: ITableOperation) => string;
  enabledGlyph: (op: ITableOperation) => string;
  buildRunPolicyText: (op: ITableOperation) => string;
  buildTooltip: (op: ITableOperation, lastResultStatus: string) => string;
  statusEmoji: (status: string) => string;
  overallStatusText: (status: string | undefined) => string;
}

export interface ITableViewController {
  renderTable: () => void;
}

export function createTableViewController(options: ITableViewControllerOptions): ITableViewController {
  let tableOpOrder: string[] = [];
  let lastTableAnchorName: string | undefined;
  let lastTableAnchorCoord: ITableAnchorCoordinate | undefined;
  let lastTablePhases: string[] = [];
  let lastTablePackages: ITablePackageRecord[] = [];

  const buildPivotData = (): { phases: string[]; packages: ITablePackageRecord[] } => {
    const allPhases: Set<string> = new Set();
    for (const op of options.getOperations().values()) {
      const phaseName: string = op.phaseName || '(none)';
      allPhases.add(phaseName);
    }
    const phases: string[] = Array.from(allPhases).sort();

    const filteredOps: ITableOperation[] = options.getFilteredOperations();
    const packageMap: Map<string, ITablePackageRecord> = new Map();
    for (const op of filteredOps) {
      const packageName: string = op.packageName || '(unknown package)';
      const phaseName: string = op.phaseName || '(none)';
      let rec: ITablePackageRecord | undefined = packageMap.get(packageName);
      if (!rec) {
        rec = { packageName, byPhase: new Map<string, ITableOperation>() };
        packageMap.set(packageName, rec);
      }
      rec.byPhase.set(phaseName, op);
    }

    const packages: ITablePackageRecord[] = Array.from(packageMap.values()).sort((a, b) =>
      a.packageName.localeCompare(b.packageName)
    );

    return { phases, packages };
  };

  const commitSelection = (nextSelection: Set<string>): void => {
    options.setSelection(nextSelection);
    options.onSelectionMutated();
  };

  const handleMultiSelectGroup = (e: MouseEvent, names: string[]): void => {
    const isMeta: boolean = e.metaKey || e.ctrlKey;
    const isShift: boolean = e.shiftKey;
    let nextSelection: Set<string> = new Set(options.getSelection());

    if (isShift && lastTableAnchorName && tableOpOrder.includes(lastTableAnchorName)) {
      if (!isMeta) nextSelection = new Set(nextSelection);
      names.forEach((name) => nextSelection.add(name));
    } else if (isMeta) {
      let anyNew: boolean = false;
      names.forEach((name) => {
        if (!nextSelection.delete(name)) {
          nextSelection.add(name);
          anyNew = true;
        }
      });
      if (anyNew && names.length) lastTableAnchorName = names[0];
    } else {
      nextSelection = new Set(names);
      if (names.length) lastTableAnchorName = names[0];
    }

    commitSelection(nextSelection);
  };

  const handlePivotCellClick = (
    e: MouseEvent,
    opName: string,
    rowIndex: number,
    phaseIndex: number
  ): void => {
    if (!opName) return;

    const isMeta: boolean = e.metaKey || e.ctrlKey;
    const isShift: boolean = e.shiftKey;

    if (isShift && lastTableAnchorCoord) {
      const { row: anchorRow, phase: anchorPhase } = lastTableAnchorCoord;
      const rowStart: number = Math.min(anchorRow, rowIndex);
      const rowEnd: number = Math.max(anchorRow, rowIndex);
      const phaseStart: number = Math.min(anchorPhase, phaseIndex);
      const phaseEnd: number = Math.max(anchorPhase, phaseIndex);
      const rectNames: Set<string> = new Set();

      for (let row: number = rowStart; row <= rowEnd; row++) {
        const packageRecord: ITablePackageRecord | undefined = lastTablePackages[row];
        if (!packageRecord) continue;

        for (let phase: number = phaseStart; phase <= phaseEnd; phase++) {
          const phaseName: string | undefined = lastTablePhases[phase];
          if (!phaseName) continue;
          const cellOp: ITableOperation | undefined = packageRecord.byPhase.get(phaseName);
          if (cellOp) rectNames.add(cellOp.name);
        }
      }

      if (isMeta) {
        const nextSelection: Set<string> = new Set(options.getSelection());
        rectNames.forEach((name) => nextSelection.add(name));
        commitSelection(nextSelection);
      } else {
        commitSelection(rectNames);
      }

      return;
    }

    const nextSelection: Set<string> = new Set(options.getSelection());
    if (isMeta) {
      if (nextSelection.has(opName)) nextSelection.delete(opName);
      else nextSelection.add(opName);
    } else {
      nextSelection.clear();
      nextSelection.add(opName);
    }

    lastTableAnchorName = opName;
    lastTableAnchorCoord = { row: rowIndex, phase: phaseIndex };
    commitSelection(nextSelection);
  };

  const renderTable = (): void => {
    const tableHead: HTMLElement | undefined = options.tableHead;
    const tableBody: HTMLElement | undefined = options.tableBody;
    const tableStats: HTMLElement | undefined = options.tableStats;
    if (!tableHead || !tableBody || !tableStats) return;

    const { phases, packages } = buildPivotData();
    tableOpOrder = [];
    lastTablePhases = phases;
    lastTablePackages = packages;

    tableHead.innerHTML = '';
    const headerRow: HTMLTableRowElement = document.createElement('tr');
    const packageHeader: HTMLTableCellElement = document.createElement('th');
    packageHeader.textContent = 'Package';
    headerRow.appendChild(packageHeader);

    for (const phase of phases) {
      const th: HTMLTableCellElement = document.createElement('th');
      const displayPhase: string = phase.replace(/^_phase:/, '');
      th.textContent = displayPhase;
      if (displayPhase !== phase) th.title = phase;
      th.style.cursor = 'pointer';
      th.addEventListener('click', (e: Event) => {
        const phaseNames: string[] = [];
        for (const op of options.getOperations().values()) {
          if ((op.phaseName || '(none)') === phase) phaseNames.push(op.name);
        }
        handleMultiSelectGroup(e as MouseEvent, phaseNames);
      });
      headerRow.appendChild(th);
    }
    tableHead.appendChild(headerRow);

    tableBody.innerHTML = '';
    let opCount: number = 0;
    const selection: Set<string> = options.getSelection();

    packages.forEach((pkg, rowIndex) => {
      const tr: HTMLTableRowElement = document.createElement('tr');

      const namesInRow: string[] = Array.from(pkg.byPhase.values()).map((op) => op.name);
      const allSelected: boolean = !!namesInRow.length && namesInRow.every((name) => selection.has(name));
      if (allSelected) tr.classList.add(tableStyles.selected);

      const pkgTd: HTMLTableCellElement = document.createElement('td');
      pkgTd.className = tableStyles['pkg-cell'];
      pkgTd.textContent = pkg.packageName;
      pkgTd.style.fontWeight = '600';
      pkgTd.style.cursor = 'pointer';
      pkgTd.addEventListener('click', (e: Event) => {
        handleMultiSelectGroup(e as MouseEvent, namesInRow);
        e.stopPropagation();
      });
      tr.appendChild(pkgTd);

      phases.forEach((phase, phaseIndex) => {
        const td: HTMLTableCellElement = document.createElement('td');
        td.className = tableStyles['pivot-cell'];
        td.style.whiteSpace = 'nowrap';

        const op: ITableOperation | undefined = pkg.byPhase.get(phase);
        if (op) {
          opCount++;
          const displayStatus: string = options.computeDisplayStatus(op);
          const glyph: string = options.enabledGlyph(op);
          const active: string = op.isActive
            ? `<span class="${tableStyles['pivot-active']}" title="Active">⚡</span>`
            : '';
          td.innerHTML = `
                <span>${options.statusEmoji(displayStatus)}</span>
                <span title="${escapeHtml(op.name)}" class="status-pill status-${escapeHtml(displayStatus)}">${escapeHtml(options.overallStatusText(displayStatus))}</span>
                <span class="${tableStyles['pivot-enabled']}" title="${escapeHtml(options.buildRunPolicyText(op))}">${glyph}</span>
                ${active}
              `;
          td.title = options.buildTooltip(op, displayStatus);
          if (selection.has(op.name)) td.classList.add(tableStyles.selected);
          td.style.cursor = 'pointer';
          tableOpOrder.push(op.name);
          td.addEventListener('click', (e: Event) => {
            handlePivotCellClick(e as MouseEvent, op.name, rowIndex, phaseIndex);
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
  };

  return {
    renderTable
  };
}

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}
