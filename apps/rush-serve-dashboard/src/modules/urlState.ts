// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export type DashboardView = 'table' | 'graph';
export type DashboardFilter = 'all' | 'failed-warn';

export interface IDashboardUrlState {
  view: DashboardView;
  filter: DashboardFilter;
}

export function loadDashboardUrlState(search: string): IDashboardUrlState {
  const state: IDashboardUrlState = {
    view: 'table',
    filter: 'all'
  };

  try {
    const params: URLSearchParams = new URLSearchParams(search);
    const viewParam: string | null = params.get('view');
    const filterParam: string | null = params.get('filter');

    if (viewParam === 'graph' || viewParam === 'table') {
      state.view = viewParam;
    }

    if (filterParam === 'failed-warn' || filterParam === 'all') {
      state.filter = filterParam;
    }
  } catch {
    // ignore invalid URL state
  }

  return state;
}

export function syncDashboardUrlState(view: DashboardView, filter: DashboardFilter): void {
  try {
    const params: URLSearchParams = new URLSearchParams(window.location.search);
    params.set('view', view);
    params.set('filter', filter);
    const newUrl: string = window.location.pathname + '?' + params.toString() + window.location.hash;
    window.history.replaceState(null, '', newUrl);
  } catch {
    // ignore browser APIs unavailable
  }
}
