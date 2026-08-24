// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createGraphViewController, graphState } from '../modules/graphView';
import graphStyles from '../styles/graphView.module.css';

describe('graph view controller', () => {
  it('renders nodes, removes transitive edges, updates indicators, and wires selection', () => {
    document.documentElement.style.setProperty('--status-success', '#00aa00');
    document.body.innerHTML = '<div id="graph"><svg id="edges"></svg></div>';
    const graphEl: HTMLElement = document.getElementById('graph') as HTMLElement;
    const edgesSvg: SVGSVGElement | undefined =
      document.querySelector<SVGSVGElement>('svg#edges') ?? undefined;
    if (!edgesSvg) {
      throw new Error('The graph edges SVG test fixture was not found.');
    }
    const operations = new Map([
      ['compile', { name: 'compile', status: 'Success', enabled: 'affected' }],
      ['build', { name: 'build', dependencies: ['compile'], status: 'Success', isActive: true }],
      ['test', { name: 'test', dependencies: ['compile', 'build'], status: 'Success', enabled: 'never' }]
    ]);
    const renderPhaseLegend = jest.fn();
    const singleSelect = jest.fn();
    const toggleSelect = jest.fn();
    const controller = createGraphViewController({
      graphEl,
      edgesSvg,
      getOperations: () => operations,
      getExecutionStates: () => new Map(),
      getQueuedStates: () => new Map([['test', { name: 'test', runInThisIteration: true }]]),
      getSelection: () => new Set(['compile', 'build']),
      getFilteredOutNames: () => new Set(),
      getSearchFilteredOutNames: () => new Set(),
      getLastExecutionResults: () => new Map(),
      getComputeDisplayStatus: () => 'Success',
      getStatusEmoji: () => 'ok',
      getOverallStatusText: (status) => status || '',
      renderPhaseLegend,
      singleSelect,
      toggleSelect
    });

    controller.ensureGraph();

    expect(graphState.nodeElements.size).toBe(3);
    expect(graphState.edgeElements.map(({ from, to }) => `${from}->${to}`).sort()).toEqual([
      'build->compile',
      'test->build'
    ]);
    expect(
      graphState.nodeElements.get('build')?.querySelector(`.${graphStyles.activeIndicator}`)
    ).not.toBeNull();
    expect(
      graphState.nodeElements.get('test')?.querySelector(`.${graphStyles.pendingIndicator}`)
    ).not.toBeNull();
    expect(
      graphState.nodeElements.get('test')?.querySelector(`.${graphStyles.enabledIndicator}`)?.textContent
    ).toBe('🔴');
    expect(renderPhaseLegend).toHaveBeenCalled();

    const compileNode: HTMLButtonElement | undefined = graphState.nodeElements.get('compile');
    expect(compileNode).toMatchObject({ type: 'button', tabIndex: 0 });
    expect(compileNode?.getAttribute('aria-label')).toBe('compile');
    expect(compileNode?.getAttribute('aria-pressed')).toBe('true');
    compileNode?.focus();
    expect(document.activeElement).toBe(compileNode);

    compileNode?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    graphState.nodeElements
      .get('build')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(singleSelect).toHaveBeenCalledWith('compile');
    expect(toggleSelect).toHaveBeenCalledWith('build');
  });
});
