// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface IComputeFilterSetsOptions {
  operations: Map<string, any>;
  executionStates: Map<string, any>;
  currentFilter: 'all' | 'failed-warn';
  searchQuery: string;
  computeDisplayStatus: (op: any) => string;
}

export interface IComputeFilterSetsResult {
  visibleOperations: any[];
  filteredOutNames: Set<string>;
  searchFilteredOutNames: Set<string>;
}

export function computeFilterSetsCore(options: IComputeFilterSetsOptions): IComputeFilterSetsResult {
  const { operations, executionStates, currentFilter, searchQuery, computeDisplayStatus } = options;

  const filteredOutNames: Set<string> = new Set();
  const searchFilteredOutNames: Set<string> = new Set();
  const visibleOperations: any[] = [];
  const query: string = searchQuery.trim().toLowerCase();

  for (const op of operations.values()) {
    const state: any = executionStates.get(op.name) || {};

    // Merge dynamic fields so rendering logic can treat operation rows uniformly.
    op.runInThisIteration = state.runInThisIteration;
    op.status = state.status || op.status;
    op.isActive = state.isActive;
    op.logFileURLs = state.logFileURLs;

    const effectiveStatus: string = computeDisplayStatus(op);
    if (currentFilter === 'failed-warn') {
      const includeInFailedWarn: boolean =
        effectiveStatus === 'Failure' || effectiveStatus === 'SuccessWithWarning';
      if (!includeInFailedWarn) {
        filteredOutNames.add(op.name);
        continue;
      }
    }

    if (query && !op.name.toLowerCase().includes(query)) {
      searchFilteredOutNames.add(op.name);
      continue;
    }

    visibleOperations.push(op);
  }

  return {
    visibleOperations,
    filteredOutNames,
    searchFilteredOutNames
  };
}

export function pruneGraphOperations(baseOperations: any[]): any[] {
  if (!baseOperations.length) return baseOperations;

  const byName: Map<string, any> = new Map();
  baseOperations.forEach((op) => byName.set(op.name, op));

  const dependents: Map<string, Set<string>> = new Map();
  baseOperations.forEach((op) => {
    (op.dependencies || []).forEach((dependencyName: string) => {
      if (!byName.has(dependencyName)) return;
      let setForDependency: Set<string> | undefined = dependents.get(dependencyName);
      if (!setForDependency) {
        setForDependency = new Set<string>();
        dependents.set(dependencyName, setForDependency);
      }
      setForDependency.add(op.name);
    });
  });

  const active: Set<string> = new Set(baseOperations.map((op) => op.name));
  const noopSet: Set<string> = new Set(baseOperations.filter((op) => op.noop).map((op) => op.name));

  const incomingCount: Map<string, number> = new Map();
  const outgoingCount: Map<string, number> = new Map();
  baseOperations.forEach((op) => {
    incomingCount.set(op.name, (dependents.get(op.name) || new Set()).size);
    const outgoing: number = (op.dependencies || []).filter((dependencyName: string) =>
      byName.has(dependencyName)
    ).length;
    outgoingCount.set(op.name, outgoing);
  });

  const queue: string[] = [];
  active.forEach((nodeName) => {
    if (!noopSet.has(nodeName)) return;
    const incoming: number = incomingCount.get(nodeName) || 0;
    const outgoing: number = outgoingCount.get(nodeName) || 0;
    if (incoming === 0 || incoming === 1 || outgoing === 1) queue.push(nodeName);
  });

  while (queue.length) {
    const nodeName: string | undefined = queue.pop();
    if (!nodeName || !active.has(nodeName)) continue;

    active.delete(nodeName);
    const op: any = byName.get(nodeName);
    if (!op) continue;

    for (const dependencyName of op.dependencies || []) {
      if (!active.has(dependencyName)) continue;
      const previous: number = incomingCount.get(dependencyName) || 0;
      incomingCount.set(dependencyName, Math.max(0, previous - 1));
      const incoming: number = incomingCount.get(dependencyName) || 0;
      const outgoing: number = outgoingCount.get(dependencyName) || 0;
      if (noopSet.has(dependencyName) && (incoming === 0 || incoming === 1 || outgoing === 1)) {
        queue.push(dependencyName);
      }
    }

    const dependentNodes: Set<string> = dependents.get(nodeName) || new Set();
    for (const dependentName of dependentNodes) {
      if (!active.has(dependentName)) continue;
      const previousOutgoing: number = outgoingCount.get(dependentName) || 0;
      outgoingCount.set(dependentName, Math.max(0, previousOutgoing - 1));
      const incoming: number = incomingCount.get(dependentName) || 0;
      const outgoing: number = outgoingCount.get(dependentName) || 0;
      if (noopSet.has(dependentName) && (incoming === 0 || incoming === 1 || outgoing === 1)) {
        queue.push(dependentName);
      }
    }
  }

  const resolvedMemo: Map<string, Set<string>> = new Map();
  function resolveDeps(nodeName: string, seen: Set<string>): Set<string> {
    const cached: Set<string> | undefined = resolvedMemo.get(nodeName);
    if (cached) return cached;

    if (seen.has(nodeName)) return new Set();
    seen.add(nodeName);

    const op: any = byName.get(nodeName);
    const resolved: Set<string> = new Set();
    if (!op) return resolved;

    for (const dependencyName of op.dependencies || []) {
      if (!byName.has(dependencyName)) continue;
      if (active.has(dependencyName)) {
        resolved.add(dependencyName);
      } else {
        const subResolved: Set<string> = resolveDeps(dependencyName, seen);
        for (const item of subResolved) resolved.add(item);
      }
    }

    seen.delete(nodeName);
    resolvedMemo.set(nodeName, resolved);
    return resolved;
  }

  return baseOperations
    .filter((op) => active.has(op.name))
    .map((op) => {
      const dependencies: Set<string> = new Set();
      for (const dependencyName of op.dependencies || []) {
        if (!byName.has(dependencyName)) continue;
        if (active.has(dependencyName)) {
          dependencies.add(dependencyName);
        } else {
          const subResolved: Set<string> = resolveDeps(dependencyName, new Set());
          for (const item of subResolved) dependencies.add(item);
        }
      }

      return Object.assign({}, op, { dependencies: Array.from(dependencies) });
    });
}
