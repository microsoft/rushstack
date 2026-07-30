// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

interface IPhaseLegendOperation {
  name: string;
  phaseName?: string;
  logFileURLs?: {
    text?: string;
    error?: string;
    jsonl?: string;
  };
}

interface IPhaseProblemOperation {
  op: IPhaseLegendOperation;
  displayStatus: string;
}

interface ILegendElement extends HTMLElement {
  _initialized?: boolean;
}

export interface IPhaseLegendControllerOptions {
  phaseGroupsEl: Element | undefined;
  legendEl: HTMLElement | undefined;
  getOperations: () => Map<string, IPhaseLegendOperation>;
  getGraphVisibleNames: () => Set<string> | undefined;
  computeDisplayStatus: (op: IPhaseLegendOperation) => string;
  statusEmoji: (status: string) => string;
  overallStatusText: (status: string | undefined) => string;
  getStatusColors: () => Record<string, string>;
}

export interface IPhaseLegendController {
  renderPhasePane: () => void;
  renderLegend: () => void;
  renderAll: () => void;
}

const phaseStatusPriority: string[] = [
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

const phaseStatusPriorityIndex: Map<string, number> = new Map(
  phaseStatusPriority.map((status, index) => [status, index])
);

const legendOrder: string[] = [...phaseStatusPriority];

export function createPhaseLegendController(options: IPhaseLegendControllerOptions): IPhaseLegendController {
  const computePhaseSummaries = (): Array<{
    phase: string;
    status: string;
    problemOps: IPhaseProblemOperation[];
  }> => {
    const byPhase: Map<string, { ops: IPhaseProblemOperation[]; statusSet: Set<string> }> = new Map();
    const graphMembership: Set<string> | undefined = options.getGraphVisibleNames();

    for (const op of options.getOperations().values()) {
      const phase: string = op.phaseName || '(none)';
      const displayStatus: string = options.computeDisplayStatus(op);

      // Keep currently executing operations visible in phase summaries even when not in graph membership.
      if (graphMembership && displayStatus !== 'Executing' && !graphMembership.has(op.name)) {
        continue;
      }

      let rec: { ops: IPhaseProblemOperation[]; statusSet: Set<string> } | undefined = byPhase.get(phase);
      if (!rec) {
        rec = { ops: [], statusSet: new Set<string>() };
        byPhase.set(phase, rec);
      }

      rec.ops.push({ op, displayStatus });
      rec.statusSet.add(displayStatus);
    }

    const summaries: Array<{
      phase: string;
      status: string;
      problemOps: IPhaseProblemOperation[];
    }> = [];

    for (const [phase, rec] of byPhase.entries()) {
      let chosen: string | undefined;
      let bestIdx: number = Infinity;

      for (const status of rec.statusSet) {
        const index: number | undefined = phaseStatusPriorityIndex.get(status);
        if (index !== undefined && index < bestIdx) {
          bestIdx = index;
          chosen = status;
        }
      }

      if (!chosen) chosen = 'Ready';

      const problemOps: IPhaseProblemOperation[] = rec.ops.filter(
        ({ displayStatus }) =>
          displayStatus === 'Failure' ||
          displayStatus === 'SuccessWithWarning' ||
          displayStatus === 'Executing'
      );

      summaries.push({ phase, status: chosen, problemOps });
    }

    summaries.sort((a, b) => a.phase.localeCompare(b.phase));
    return summaries;
  };

  const renderPhasePane = (): void => {
    if (!options.phaseGroupsEl) return;

    const summaries: Array<{ phase: string; status: string; problemOps: IPhaseProblemOperation[] }> =
      computePhaseSummaries();
    (options.phaseGroupsEl as HTMLElement).innerHTML = '';

    if (!summaries.length) {
      const empty: HTMLDivElement = document.createElement('div');
      empty.className = 'phase-pane-empty';
      empty.textContent = 'No phases';
      options.phaseGroupsEl.appendChild(empty);
      return;
    }

    for (const summary of summaries) {
      const group: HTMLDivElement = document.createElement('div');
      group.className = 'phase-group';

      const header: HTMLDivElement = document.createElement('div');
      header.className = 'phase-header';

      const emoji: HTMLSpanElement = document.createElement('span');
      emoji.className = 'phase-status-emoji';
      emoji.textContent = options.statusEmoji(summary.status);

      const nameSpan: HTMLSpanElement = document.createElement('span');
      nameSpan.className = 'phase-name';
      nameSpan.textContent = summary.phase.replace(/^_phase:/, '');

      header.appendChild(emoji);
      header.appendChild(nameSpan);
      group.appendChild(header);

      if (summary.problemOps.length) {
        const list: HTMLUListElement = document.createElement('ul');
        list.className = 'phase-problems';

        const sortedProblems: IPhaseProblemOperation[] = [...summary.problemOps].sort((a, b) => {
          const ai: number = phaseStatusPriorityIndex.get(a.displayStatus) ?? 999;
          const bi: number = phaseStatusPriorityIndex.get(b.displayStatus) ?? 999;
          if (ai !== bi) return ai - bi;
          const an: string = a.op.name.toLowerCase();
          const bn: string = b.op.name.toLowerCase();
          if (an < bn) return -1;
          if (an > bn) return 1;
          return 0;
        });

        for (const { op, displayStatus } of sortedProblems) {
          const item: HTMLLIElement = document.createElement('li');

          const status: HTMLSpanElement = document.createElement('span');
          status.className = 'phase-problem-emoji';
          status.textContent = options.statusEmoji(displayStatus);
          item.appendChild(status);

          const logUrl: string | undefined =
            (op.logFileURLs && (op.logFileURLs.text || op.logFileURLs.error || op.logFileURLs.jsonl)) ||
            undefined;
          if (logUrl) {
            const link: HTMLAnchorElement = document.createElement('a');
            link.href = logUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = op.name;
            item.appendChild(link);
          } else {
            const span: HTMLSpanElement = document.createElement('span');
            span.textContent = op.name;
            item.appendChild(span);
          }

          list.appendChild(item);
        }

        group.appendChild(list);
      }

      options.phaseGroupsEl.appendChild(group);
    }
  };

  const renderLegend = (): void => {
    const legendEl: ILegendElement | undefined = options.legendEl as ILegendElement | undefined;
    if (!legendEl) return;

    if (!legendEl._initialized) {
      const header: HTMLHeadingElement = document.createElement('h4');
      header.textContent = 'Legend';

      const toggleBtn: HTMLButtonElement = document.createElement('button');
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

      const collapsed: boolean = window.localStorage.getItem('rushServeLegendCollapsed') === '1';
      if (collapsed) legendEl.classList.add('collapsed');
      toggleBtn.textContent = collapsed ? '+' : '−';
      toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

      toggleBtn.addEventListener('click', () => {
        const isCollapsed: boolean = legendEl.classList.toggle('collapsed');
        window.localStorage.setItem('rushServeLegendCollapsed', isCollapsed ? '1' : '0');
        toggleBtn.textContent = isCollapsed ? '+' : '−';
        toggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand legend' : 'Collapse legend');
        toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        renderLegend();
      });
    }

    while (legendEl.children.length > 1) {
      const lastChild: ChildNode | null = legendEl.lastChild;
      if (!lastChild) break;
      legendEl.removeChild(lastChild);
    }

    if (legendEl.classList.contains('collapsed')) {
      const stub: HTMLDivElement = document.createElement('div');
      stub.style.fontSize = '0.5rem';
      stub.style.opacity = '0.7';
      stub.textContent = 'Collapsed';
      legendEl.appendChild(stub);
      return;
    }

    const statusColors: Record<string, string> = options.getStatusColors();

    const columnsWrap: HTMLDivElement = document.createElement('div');
    columnsWrap.className = 'legend-columns';

    const colPrimary: HTMLDivElement = document.createElement('div');
    colPrimary.className = 'legend-col';

    const primaryHead: HTMLDivElement = document.createElement('div');
    primaryHead.className = 'legend-heading';
    primaryHead.textContent = 'Statuses';
    colPrimary.appendChild(primaryHead);

    for (const status of legendOrder) {
      const row: HTMLDivElement = document.createElement('div');
      row.className = 'legend-row';

      const sample: HTMLSpanElement = document.createElement('span');
      sample.className = 'legend-emoji';
      sample.textContent = options.statusEmoji(status);
      sample.style.borderColor = statusColors[status] || '#4b5563';

      const labelWrap: HTMLDivElement = document.createElement('div');
      labelWrap.className = 'legend-label-wrap';
      const titleSpan: HTMLSpanElement = document.createElement('span');
      titleSpan.textContent = options.overallStatusText(status);
      labelWrap.appendChild(titleSpan);

      row.appendChild(sample);
      row.appendChild(labelWrap);
      colPrimary.appendChild(row);
    }

    const unknownRow: HTMLDivElement = document.createElement('div');
    unknownRow.className = 'legend-row';

    const unknownSample: HTMLSpanElement = document.createElement('span');
    unknownSample.className = 'legend-emoji status-Unknown';
    unknownSample.textContent = '❓';
    unknownSample.style.borderColor = '#4b5563';

    const unknownLabelWrap: HTMLDivElement = document.createElement('div');
    unknownLabelWrap.className = 'legend-label-wrap';

    const unknownTitle: HTMLSpanElement = document.createElement('span');
    unknownTitle.textContent = 'UNKNOWN';
    const unknownDetail: HTMLElement = document.createElement('small');
    unknownDetail.textContent = 'Never executed';

    unknownLabelWrap.appendChild(unknownTitle);
    unknownLabelWrap.appendChild(unknownDetail);

    unknownRow.appendChild(unknownSample);
    unknownRow.appendChild(unknownLabelWrap);
    colPrimary.appendChild(unknownRow);

    const colSecondary: HTMLDivElement = document.createElement('div');
    colSecondary.className = 'legend-col';

    const secondaryHead: HTMLDivElement = document.createElement('div');
    secondaryHead.className = 'legend-heading';
    secondaryHead.textContent = 'State Modifiers';
    colSecondary.appendChild(secondaryHead);

    const addModifier = (sampleFactory: () => HTMLElement, label: string, detail?: string): void => {
      const row: HTMLDivElement = document.createElement('div');
      row.className = 'legend-row';
      const sample: HTMLElement = sampleFactory();

      const labelWrap: HTMLDivElement = document.createElement('div');
      labelWrap.className = 'legend-label-wrap';
      const titleSpan: HTMLSpanElement = document.createElement('span');
      titleSpan.textContent = label;
      labelWrap.appendChild(titleSpan);

      if (detail) {
        const small: HTMLElement = document.createElement('small');
        small.textContent = detail;
        labelWrap.appendChild(small);
      }

      row.appendChild(sample);
      row.appendChild(labelWrap);
      colSecondary.appendChild(row);
    };

    const makeNodeBox = (borderStyle?: string, boxShadow?: string, borderColor?: string): HTMLElement => {
      const sample: HTMLSpanElement = document.createElement('span');
      sample.className = 'legend-emoji';
      if (borderStyle) sample.style.borderStyle = borderStyle;
      if (borderColor) sample.style.borderColor = borderColor;
      if (boxShadow) sample.style.boxShadow = boxShadow;
      sample.textContent = ' ';
      return sample;
    };

    const makeDashed = (): HTMLElement => makeNodeBox('dashed');
    const makeDotted = (): HTMLElement => makeNodeBox('dotted');

    const makeActive = (): HTMLElement => {
      const wrap: HTMLDivElement = document.createElement('div');
      wrap.className = 'legend-enabled-sample';

      const base: HTMLSpanElement = document.createElement('span');
      base.style.opacity = '0.15';
      base.style.fontSize = '11px';
      base.textContent = '⬜';
      wrap.appendChild(base);

      const rocket: HTMLSpanElement = document.createElement('span');
      rocket.style.position = 'absolute';
      rocket.style.bottom = '0';
      rocket.style.left = '0';
      rocket.style.transform = 'translate(-50%, 50%)';
      rocket.style.fontSize = '12px';
      rocket.textContent = '⚡';
      wrap.appendChild(rocket);

      return wrap;
    };

    const makePending = (): HTMLElement => {
      const wrap: HTMLDivElement = document.createElement('div');
      wrap.className = 'legend-enabled-sample';

      const base: HTMLSpanElement = document.createElement('span');
      base.style.opacity = '0.15';
      base.style.fontSize = '11px';
      base.textContent = '⬜';
      wrap.appendChild(base);

      const clock: HTMLSpanElement = document.createElement('span');
      clock.style.position = 'absolute';
      clock.style.top = '0';
      clock.style.left = '0';
      clock.style.transform = 'translate(-50%, -50%)';
      clock.style.fontSize = '12px';
      clock.textContent = '🕒';
      wrap.appendChild(clock);

      return wrap;
    };

    const makeEnabledSample = (emoji: string): HTMLElement => {
      const wrap: HTMLDivElement = document.createElement('div');
      wrap.className = 'legend-enabled-sample';
      const sub: HTMLSpanElement = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = emoji;
      wrap.appendChild(sub);
      return wrap;
    };

    addModifier(makePending, 'Pending changes', 'Iteration queued');
    addModifier(makeActive, 'Active', 'In-memory state');
    addModifier(makeDashed, 'Not in this iteration', 'Excluded this iteration');
    addModifier(makeDotted, 'Filtered out', 'Hidden by view/search');

    const enabledHead: HTMLDivElement = document.createElement('div');
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
  };

  return {
    renderPhasePane,
    renderLegend,
    renderAll: () => {
      renderPhasePane();
      renderLegend();
    }
  };
}
