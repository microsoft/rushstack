// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { syncDashboardUrlState, type DashboardFilter, type DashboardView } from './urlState';

export interface IViewBarWiringOptions {
  getView: () => DashboardView;
  setView: (next: DashboardView) => void;
  getFilter: () => DashboardFilter;
  setFilter: (next: DashboardFilter) => void;
  setSearchQuery: (next: string) => void;
  markGraphDirty: () => void;
  render: () => void;
}

export function wireViewBar(options: IViewBarWiringOptions): void {
  const { getView, setView, getFilter, setFilter, setSearchQuery, markGraphDirty, render } = options;

  document.querySelectorAll('input[name="view"]').forEach((radio: Element) => {
    radio.addEventListener('change', () => {
      const input: HTMLInputElement = radio as HTMLInputElement;
      if (!input.checked) return;

      setView(input.value as DashboardView);
      _applyViewVisibility(getView());
      syncDashboardUrlState(getView(), getFilter());
      render();
    });
  });

  const filterSelect: HTMLSelectElement | null = document.getElementById(
    'filter-select'
  ) as HTMLSelectElement | null;
  if (filterSelect) {
    filterSelect.addEventListener('change', (e: Event) => {
      const next: DashboardFilter = (e.target as HTMLSelectElement).value as DashboardFilter;
      setFilter(next);
      markGraphDirty();
      syncDashboardUrlState(getView(), getFilter());
      render();
    });
  }

  const nameSearchInput: HTMLInputElement | null = document.getElementById(
    'name-search'
  ) as HTMLInputElement | null;
  if (nameSearchInput) {
    nameSearchInput.addEventListener('input', () => {
      setSearchQuery(nameSearchInput.value);
      markGraphDirty();
      render();
    });
  }

  const initialView: DashboardView = getView();
  const viewRadio: HTMLInputElement | null = document.querySelector(
    `input[name="view"][value="${initialView}"]`
  ) as HTMLInputElement | null;
  if (viewRadio) {
    viewRadio.checked = true;
  }

  if (filterSelect) {
    filterSelect.value = getFilter();
  }

  _applyViewVisibility(initialView);
  syncDashboardUrlState(getView(), getFilter());
}

function _applyViewVisibility(view: DashboardView): void {
  const leftPane: HTMLElement | null = document.getElementById('left');
  const rightPane: HTMLElement | null = document.getElementById('right');

  if (leftPane) {
    leftPane.style.display = view === 'table' ? '' : 'none';
  }

  if (rightPane) {
    rightPane.style.display = view === 'graph' ? '' : 'none';
  }
}
