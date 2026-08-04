// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiSgrParser } from '../modules/ansiSgrParser';
import {
  applyExecutionStates,
  patchOperationsFromPayload,
  setOperationsFromPayload,
  setQueuedStates,
  toLastExecutionResultsMap
} from '../modules/dashboardMutations';
import { computeFilterSetsCore, pruneGraphOperations } from '../modules/graphFiltering';
import {
  buildRunPolicyText,
  buildTooltip,
  computeDisplayStatus,
  enabledGlyph,
  getStatusColors,
  statusEmoji
} from '../modules/statusHelpers';
import { loadDashboardUrlState, syncDashboardUrlState } from '../modules/urlState';

describe(AnsiSgrParser.name, () => {
  it('applies styles, preserves state between chunks, and resets it', () => {
    const parser: AnsiSgrParser = new AnsiSgrParser();

    expect(parser.process('plain\u001b[1;31mbold red')).toEqual([
      { text: 'plain', style: '' },
      { text: 'bold red', style: 'color: #a00; font-weight: 700' }
    ]);
    expect(parser.process(' continued\u001b[0m reset')).toEqual([
      { text: ' continued', style: 'color: #a00; font-weight: 700' },
      { text: ' reset', style: '' }
    ]);
  });

  it('supports bright, background, underline, and inverse styles', () => {
    const parser: AnsiSgrParser = new AnsiSgrParser();

    expect(parser.process('\u001b[4;7;96;41mstyled')).toEqual([
      {
        text: 'styled',
        style: 'color: #55ffff; background-color: #a00; text-decoration: underline; filter: invert(100%)'
      }
    ]);
  });

  it('leaves malformed escape sequences as text', () => {
    expect(new AnsiSgrParser().process('before\u001b[not-sgr')).toEqual([
      { text: 'before\u001b[not-sgr', style: '' }
    ]);
  });
});

describe('dashboard mutations', () => {
  it('replaces, patches, and updates operation state', () => {
    const operations: Map<string, { name: string; status?: string; isActive?: boolean }> = new Map([
      ['old', { name: 'old' }]
    ]);
    const executionStates: Map<string, { name: string; status?: string }> = new Map();

    setOperationsFromPayload(operations, [{ name: 'build', status: 'Ready' }]);
    patchOperationsFromPayload(operations, [{ name: 'test', status: 'Waiting' }]);
    applyExecutionStates(operations, executionStates, [
      { name: 'build', status: 'Success', isActive: true },
      { name: 'unknown', status: 'Failure' }
    ]);

    expect(Array.from(operations.keys())).toEqual(['build', 'test']);
    expect(operations.get('build')).toMatchObject({ status: 'Success', isActive: true });
    expect(executionStates.has('unknown')).toBe(true);
  });

  it('replaces queued states and indexes prior results', () => {
    const queuedStates: Map<string, { name: string; status?: string }> = new Map([['old', { name: 'old' }]]);
    setQueuedStates(queuedStates, [{ name: 'next', status: 'Queued' }]);

    expect(Array.from(queuedStates.keys())).toEqual(['next']);
    expect(toLastExecutionResultsMap([{ name: 'build', status: 'Failure' }]).get('build')?.status).toBe(
      'Failure'
    );
    expect(toLastExecutionResultsMap(undefined).size).toBe(0);
  });
});

describe('graph filtering', () => {
  it('merges execution state before filtering by status and search text', () => {
    const operations: Map<string, { name: string; status?: string; isActive?: boolean }> = new Map([
      ['package-a (build)', { name: 'package-a (build)', status: 'Ready' }],
      ['package-b (test)', { name: 'package-b (test)', status: 'Success' }]
    ]);

    const result = computeFilterSetsCore({
      operations,
      executionStates: new Map([
        ['package-a (build)', { name: 'package-a (build)', status: 'Failure', isActive: true }]
      ]),
      currentFilter: 'failed-warn',
      searchQuery: 'PACKAGE-A',
      computeDisplayStatus: (operation) => operation.status || 'Ready'
    });

    expect(result.visibleOperations.map((operation) => operation.name)).toEqual(['package-a (build)']);
    expect(result.filteredOutNames).toEqual(new Set(['package-b (test)']));
    expect(operations.get('package-a (build)')).toMatchObject({ status: 'Failure', isActive: true });
  });

  it('removes no-op nodes and reconnects their dependents', () => {
    const result = pruneGraphOperations([
      { name: 'compile', dependencies: [] },
      { name: 'noop', dependencies: ['compile'], noop: true },
      { name: 'test', dependencies: ['noop'] }
    ]);

    expect(result).toEqual([
      { name: 'compile', dependencies: [] },
      { name: 'test', dependencies: ['compile'] }
    ]);
  });
});

describe('status helpers', () => {
  it('uses current state, prior results, and defaults in priority order', () => {
    expect(
      computeDisplayStatus(
        { name: 'build', status: 'Ready' },
        new Map([['build', { name: 'build', status: 'Executing' }]]),
        new Map()
      )
    ).toBe('Executing');
    expect(
      computeDisplayStatus(
        { name: 'build', runInThisIteration: false },
        new Map(),
        new Map([['build', { name: 'build', status: 'Success' }]])
      )
    ).toBe('Success');
    expect(computeDisplayStatus({ name: 'noop', noop: true }, new Map(), new Map())).toBe('NoOp');
  });

  it('formats status, policy, and tooltip text', () => {
    expect(statusEmoji('Failure')).toBe('❌');
    expect(statusEmoji('custom')).toBe('•');
    expect(enabledGlyph({ name: 'build', enabled: 'never' })).toBe('🔴');
    expect(buildRunPolicyText({ name: 'build', enabled: 'ignore-dependency-changes' })).toBe(
      'Ignores dependency changes'
    );
    expect(buildTooltip({ name: 'build', isActive: true }, 'Success')).toContain('Has in-memory state');
  });

  it('reads status colors with fallback variables', () => {
    document.documentElement.style.setProperty('--status-ready', '#111111');
    document.documentElement.style.setProperty('--warn', '#222222');
    document.documentElement.style.setProperty('--danger', '#333333');

    expect(getStatusColors()).toMatchObject({
      Ready: '#111111',
      Executing: '#222222',
      Failure: '#333333'
    });
  });
});

describe('URL state', () => {
  it('loads supported values and ignores unsupported values', () => {
    expect(loadDashboardUrlState('?view=graph&filter=failed-warn')).toEqual({
      view: 'graph',
      filter: 'failed-warn'
    });
    expect(loadDashboardUrlState('?view=cards&filter=success')).toEqual({ view: 'table', filter: 'all' });
  });

  it('updates dashboard parameters while preserving other URL state', () => {
    window.history.replaceState(null, '', '/dashboard?custom=value#output');

    syncDashboardUrlState('graph', 'failed-warn');

    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/dashboard?custom=value&view=graph&filter=failed-warn#output'
    );
  });
});
