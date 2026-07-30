// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createGraphSelectionController } from '../modules/graphSelection';

describe('graph selection controller', () => {
  it('selects nodes and expands dependencies and consumers transitively', () => {
    const graphEl: HTMLDivElement = document.createElement('div');
    let selection: Set<string> = new Set();
    const onSelectionChanged = jest.fn();
    const controller = createGraphSelectionController({
      graphEl,
      getCurrentView: () => 'graph',
      getSelection: () => selection,
      setSelection: (next) => (selection = next),
      getOperations: () =>
        new Map([
          ['compile', { name: 'compile' }],
          ['build', { name: 'build', dependencies: ['compile'] }],
          ['test', { name: 'test', dependencies: ['build'] }]
        ]),
      getGraphNodePositions: () => new Map(),
      graphNodeWidth: 100,
      graphNodeHeight: 40,
      onSelectionChanged,
      onLiveSelectionChanged: jest.fn()
    });

    controller.singleSelect('test');
    controller.expandSelectionDependencies();
    expect(selection).toEqual(new Set(['test', 'build', 'compile']));
    controller.singleSelect('compile');
    controller.expandSelectionConsumers();
    expect(selection).toEqual(new Set(['compile', 'build', 'test']));
    controller.toggleSelect('build');
    expect(selection).toEqual(new Set(['compile', 'test']));
    expect(onSelectionChanged).toHaveBeenCalledTimes(5);
  });

  it('replaces selection using a marquee over graph nodes', () => {
    const graphEl: HTMLDivElement = document.createElement('div');
    document.body.appendChild(graphEl);
    graphEl.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    let selection: Set<string> = new Set(['outside']);
    const onLiveSelectionChanged = jest.fn();
    const controller = createGraphSelectionController({
      graphEl,
      getCurrentView: () => 'graph',
      getSelection: () => selection,
      setSelection: (next) => (selection = next),
      getOperations: () => new Map(),
      getGraphNodePositions: () =>
        new Map([
          ['inside', { x: 10, y: 10 }],
          ['outside', { x: 200, y: 200 }]
        ]),
      graphNodeWidth: 50,
      graphNodeHeight: 30,
      onSelectionChanged: jest.fn(),
      onLiveSelectionChanged
    });
    controller.wireGraphMarqueeSelection();

    graphEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
    graphEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100, clientY: 100 }));
    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(selection).toEqual(new Set(['inside']));
    expect(onLiveSelectionChanged).toHaveBeenCalled();
    expect(graphEl.querySelector('.graph-marquee')).toBeNull();
  });
});
