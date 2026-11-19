// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { wireViewBar } from '../modules/viewBar';
import type { DashboardFilter, DashboardView } from '../modules/urlState';

describe(wireViewBar.name, () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input name="view" value="table" type="radio">
      <input name="view" value="graph" type="radio">
      <select id="filter-select">
        <option value="all">All</option>
        <option value="failed-warn">Failed or warning</option>
      </select>
      <input id="name-search">
      <div id="left"></div>
      <div id="right"></div>`;
    window.history.replaceState(null, '', '/dashboard');
  });

  it('initializes controls, panel visibility, and URL state', () => {
    wireViewBar({
      getView: () => 'graph',
      setView: jest.fn(),
      getFilter: () => 'failed-warn',
      setFilter: jest.fn(),
      setSearchQuery: jest.fn(),
      markGraphDirty: jest.fn(),
      render: jest.fn()
    });

    expect(document.querySelector<HTMLInputElement>('input[value="graph"]')?.checked).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#filter-select')?.value).toBe('failed-warn');
    expect(document.getElementById('left')?.style.display).toBe('none');
    expect(document.getElementById('right')?.style.display).toBe('');
    expect(window.location.search).toBe('?view=graph&filter=failed-warn');
  });

  it('updates state and renders when view, filter, and search controls change', () => {
    let view: DashboardView = 'table';
    let filter: DashboardFilter = 'all';
    const setSearchQuery = jest.fn();
    const markGraphDirty = jest.fn();
    const render = jest.fn();
    wireViewBar({
      getView: () => view,
      setView: (next: DashboardView) => (view = next),
      getFilter: () => filter,
      setFilter: (next: DashboardFilter) => (filter = next),
      setSearchQuery,
      markGraphDirty,
      render
    });

    const graphRadio: HTMLInputElement = document.querySelector<HTMLInputElement>(
      'input[value="graph"]'
    ) as HTMLInputElement;
    graphRadio.checked = true;
    graphRadio.dispatchEvent(new Event('change'));

    const filterSelect: HTMLSelectElement = document.getElementById('filter-select') as HTMLSelectElement;
    filterSelect.value = 'failed-warn';
    filterSelect.dispatchEvent(new Event('change'));

    const searchInput: HTMLInputElement = document.getElementById('name-search') as HTMLInputElement;
    searchInput.value = 'build';
    searchInput.dispatchEvent(new Event('input'));

    expect(view).toBe('graph');
    expect(filter).toBe('failed-warn');
    expect(setSearchQuery).toHaveBeenCalledWith('build');
    expect(markGraphDirty).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(3);
    expect(document.getElementById('left')?.style.display).toBe('none');
    expect(document.getElementById('right')?.style.display).toBe('');
    expect(window.location.search).toBe('?view=graph&filter=failed-warn');
  });
});
