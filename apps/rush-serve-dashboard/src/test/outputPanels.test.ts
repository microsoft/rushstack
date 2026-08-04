// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createPhaseLegendController } from '../modules/phaseLegend';
import { createTerminalPaneController } from '../modules/terminalPane';
import graphStyles from '../styles/graphView.module.css';
import terminalStyles from '../styles/terminalPane.module.css';

describe('phase and legend controller', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = '<div id="phases"></div><div id="legend"></div>';
  });

  it('summarizes visible phases by priority and links operation logs', () => {
    const operations = new Map([
      ['build-a', { name: 'build-a', phaseName: '_phase:build', logFileURLs: { text: '/logs/build-a.log' } }],
      ['build-b', { name: 'build-b', phaseName: '_phase:build' }],
      ['hidden', { name: 'hidden', phaseName: '_phase:test' }],
      ['executing', { name: 'executing', phaseName: '_phase:test' }]
    ]);
    const statuses: Record<string, string> = {
      'build-a': 'Failure',
      'build-b': 'Success',
      hidden: 'Success',
      executing: 'Executing'
    };
    const controller = createPhaseLegendController({
      phaseGroupsEl: document.getElementById('phases') ?? undefined,
      legendEl: document.getElementById('legend') ?? undefined,
      getOperations: () => operations,
      getGraphVisibleNames: () => new Set(['build-a', 'build-b']),
      computeDisplayStatus: (operation) => statuses[operation.name],
      statusEmoji: (status) => status,
      overallStatusText: (status) => status || '',
      getStatusColors: () => ({ Failure: '#ff0000' })
    });

    controller.renderAll();

    const phases: HTMLElement = document.getElementById('phases') as HTMLElement;
    expect(phases.textContent).toContain('build');
    expect(phases.textContent).toContain('Failure');
    expect(phases.textContent).toContain('executing');
    expect(phases.textContent).not.toContain('hidden');
    const logLink: HTMLAnchorElement = phases.querySelector('a') as HTMLAnchorElement;
    expect(logLink.getAttribute('href')).toBe('/logs/build-a.log');
    expect(logLink.rel).toBe('noopener noreferrer');

    const collapseButton: HTMLButtonElement = document.getElementById(
      'legend-collapse-btn'
    ) as HTMLButtonElement;
    collapseButton.click();
    expect(document.getElementById('legend')?.classList.contains(graphStyles.collapsed)).toBe(true);
    expect(window.localStorage.getItem('rushServeLegendCollapsed')).toBe('1');
  });
});

describe('terminal pane controller', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = `
      <button id="toggle"></button><button id="clear"></button><button id="autoscroll"></button>
      <input id="autoscroll-checkbox" type="checkbox" checked>
      <div id="resizer"></div><div id="terminal"><div id="body"></div></div>`;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders ANSI chunks and wires clear, auto-scroll, and visibility controls', () => {
    const terminalEl: HTMLElement = document.getElementById('terminal') as HTMLElement;
    const terminalBody: HTMLElement = document.getElementById('body') as HTMLElement;
    terminalEl.getBoundingClientRect = () => ({ width: 320 }) as DOMRect;
    const controller = createTerminalPaneController({
      terminalEl,
      terminalBody,
      termClearBtn: document.getElementById('clear') ?? undefined,
      termAutoScrollCheckbox: document.getElementById('autoscroll-checkbox') as HTMLInputElement,
      termAutoscrollBtn: document.getElementById('autoscroll') ?? undefined,
      toggleTerminalBtn: document.getElementById('toggle') ?? undefined,
      resizerEl: document.getElementById('resizer') ?? undefined
    });

    controller.appendChunk('stderr', '\u001b[31mfailed');
    const chunk: HTMLElement = terminalBody.querySelector(`.${terminalStyles.termChunk}`) as HTMLElement;
    expect(chunk.textContent).toBe('failed');
    expect(chunk.classList.contains(terminalStyles.stderr)).toBe(true);
    expect(chunk.style.color).toBe('rgb(170, 0, 0)');
    expect(terminalEl.classList.contains(terminalStyles.termFlash)).toBe(true);
    jest.advanceTimersByTime(350);
    expect(terminalEl.classList.contains(terminalStyles.termFlash)).toBe(false);

    document.getElementById('autoscroll')?.click();
    expect((document.getElementById('autoscroll-checkbox') as HTMLInputElement).checked).toBe(false);
    document.getElementById('toggle')?.click();
    expect(terminalEl.classList.contains(terminalStyles.hidden)).toBe(true);
    document.getElementById('clear')?.click();
    expect(terminalBody.textContent).toBe('');
  });
});
