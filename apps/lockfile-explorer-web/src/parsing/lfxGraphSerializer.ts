// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IJsonLfxDependency, IJsonLfxEntry, IJsonLfxGraph } from './JsonLfxGraph';
import { type ILockfileEntryOptions, LfxGraph, LockfileDependency, LockfileEntry } from './LfxGraph';

export function serializeToJson(graph: LfxGraph): IJsonLfxGraph {
  const jsonLfxEntries: IJsonLfxEntry[] = [];

  const jsonIdByEntry: Map<LockfileEntry, number> = new Map();

  function toJsonId(entry: LockfileEntry): number {
    const result: number | undefined = jsonIdByEntry.get(entry);
    if (result === undefined) {
      throw new Error('Attempt to serialize disconnected object');
    }
    return result;
  }

  // First create the jsonId mapping
  for (const entry of graph.entries) {
    const nextIndex: number = jsonLfxEntries.length;

    const jsonLfxEntry: IJsonLfxEntry = {
      jsonId: nextIndex,

      kind: entry.kind,
      entryId: entry.entryId,
      rawEntryId: entry.rawEntryId,
      packageJsonFolderPath: entry.packageJsonFolderPath,
      entryPackageName: entry.entryPackageName,
      displayText: entry.displayText,
      entryPackageVersion: entry.entryPackageVersion,
      entrySuffix: entry.entrySuffix,

      // Lists will be added in the second loop
      dependencies: [],
      transitivePeerDependencies: [],
      referrerJsonIds: []
    };

    jsonLfxEntries.push(jsonLfxEntry);
    jsonIdByEntry.set(entry, jsonLfxEntry.jsonId);
  }

  // Use the jsonId mapping to serialize the lists
  for (let i: number = 0; i < jsonLfxEntries.length; ++i) {
    const jsonLfxEntry: IJsonLfxEntry = jsonLfxEntries[i];
    const entry: LockfileEntry = graph.entries[i];

    for (const dependency of entry.dependencies) {
      const jsonLfxDependency: IJsonLfxDependency = {
        name: dependency.name,
        version: dependency.version,
        entryId: dependency.entryId,
        dependencyType: dependency.dependencyType,
        peerDependencyMeta: {
          name: dependency.peerDependencyMeta.name,
          version: dependency.peerDependencyMeta.version,
          optional: dependency.peerDependencyMeta.optional
        }
      };
      if (dependency.resolvedEntry) {
        jsonLfxDependency.resolvedEntryJsonId = toJsonId(dependency.resolvedEntry);
      }

      jsonLfxEntry.dependencies.push(jsonLfxDependency);
    }
    jsonLfxEntry.transitivePeerDependencies = Array.from(entry.transitivePeerDependencies);
    jsonLfxEntry.referrerJsonIds = entry.referrers.map((x) => toJsonId(x));
  }

  return { entries: jsonLfxEntries };
}

export function deserializeFromJson(jsonLfxGraph: IJsonLfxGraph): LfxGraph {
  const graph: LfxGraph = new LfxGraph();

  const entries: LockfileEntry[] = graph.entries;

  function fromJsonId(jsonId: number): LockfileEntry {
    const result: LockfileEntry | undefined = entries[jsonId];
    if (result === undefined) {
      throw new Error('Invalid jsonId');
    }
    return result;
  }

  const jsonLfxEntries: IJsonLfxEntry[] = jsonLfxGraph.entries;

  // First create the jsonId mapping
  for (const jsonLfxEntry of jsonLfxEntries) {
    const options: ILockfileEntryOptions = {
      kind: jsonLfxEntry.kind,
      entryId: jsonLfxEntry.entryId,
      rawEntryId: jsonLfxEntry.rawEntryId,
      packageJsonFolderPath: jsonLfxEntry.packageJsonFolderPath,
      entryPackageName: jsonLfxEntry.entryPackageName,
      displayText: jsonLfxEntry.displayText,
      entryPackageVersion: jsonLfxEntry.entryPackageVersion,
      entrySuffix: jsonLfxEntry.entrySuffix
    };
    entries.push(new LockfileEntry(options));
  }

  // Use the jsonId mapping to deserialize the lists
  for (let i: number = 0; i < jsonLfxEntries.length; ++i) {
    const jsonLfxEntry: IJsonLfxEntry = jsonLfxEntries[i];
    const entry: LockfileEntry = graph.entries[i];

    for (const jsonLfxDependency of jsonLfxEntry.dependencies) {
      const dependency: LockfileDependency = new LockfileDependency({
        name: jsonLfxDependency.name,
        version: jsonLfxDependency.version,
        dependencyType: jsonLfxDependency.dependencyType,
        containingEntry: entry,
        entryId: jsonLfxDependency.entryId,
        peerDependencyMeta: {
          name: jsonLfxDependency.peerDependencyMeta.name,
          version: jsonLfxDependency.peerDependencyMeta.version,
          optional: jsonLfxDependency.peerDependencyMeta.optional
        }
      });

      if (jsonLfxDependency.resolvedEntryJsonId) {
        dependency.resolvedEntry = fromJsonId(jsonLfxDependency.resolvedEntryJsonId);
      }

      entry.dependencies.push(dependency);
    }

    for (const item of jsonLfxEntry.transitivePeerDependencies) {
      entry.transitivePeerDependencies.add(item);
    }

    for (const referrerJsonId of jsonLfxEntry.referrerJsonIds) {
      entry.referrers.push(fromJsonId(referrerJsonId));
    }
  }

  return graph;
}
