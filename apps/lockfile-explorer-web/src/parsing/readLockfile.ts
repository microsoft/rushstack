// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LockfileEntry, LockfileEntryFilter } from './LockfileEntry';
import { IDependencyType } from './LockfileDependency';
import { Path } from '@lifaon/path';

const serviceUrl: string = window.appContext.serviceUrl;

export interface IPackageJsonType {
  name: string;
  dependencies: {
    [key in string]: string;
  };
  devDependencies: {
    [key in string]: string;
  };
}

export interface ILockfilePackageType {
  lockfileVersion: number;
  importers?: {
    [key in string]: {
      specifiers?: {
        [key in string]: string;
      };
      dependencies?: {
        [key in string]: string;
      };
      devDependencies?: {
        [key in string]: string;
      };
    };
  };
  packages?: {
    [key in string]: {
      resolution: {
        integrity: string;
      };
      dependencies?: {
        [key in string]: string;
      };
      peerDependencies?: {
        [key in string]: string;
      };
      dev: boolean;
    };
  };
}

/**
 * Parse through the lockfile and create all the corresponding LockfileEntries and LockfileDependencies
 * to construct the lockfile graph.
 *
 * @returns A list of all the LockfileEntries in the lockfile.
 */
export function generateLockfileGraph(lockfile: ILockfilePackageType): LockfileEntry[] {
  const allEntries: LockfileEntry[] = [];
  const allEntriesById: { [key in string]: LockfileEntry } = {};

  const allImporters = [];
  if (lockfile.importers) {
    // Find duplicate importer names
    const baseNames = new Set<string>();
    const duplicates = new Set<string>();
    for (const importerKey of Object.keys(lockfile.importers)) {
      const baseName = new Path(importerKey).basename();
      if (baseName) {
        if (baseNames.has(baseName)) {
          duplicates.add(baseName);
        }
        baseNames.add(baseName);
      }
    }

    for (const [importerKey, importerValue] of Object.entries(lockfile.importers)) {
      // console.log('normalized importer key: ', new Path(importerKey).makeAbsolute('/').toString());

      // const normalizedPath = new Path(importerKey).makeAbsolute('/').toString();
      const importer = new LockfileEntry({
        // entryId: normalizedPath,
        rawEntryId: importerKey,
        kind: LockfileEntryFilter.Project,
        rawYamlData: importerValue,
        duplicates
      });
      allImporters.push(importer);
      allEntries.push(importer);
      allEntriesById[importer.entryId] = importer;
    }
  }

  const allPackages = [];
  if (lockfile.packages) {
    for (const [dependencyKey, dependencyValue] of Object.entries(lockfile.packages)) {
      // const normalizedPath = new Path(dependencyKey).makeAbsolute('/').toString();

      const currEntry = new LockfileEntry({
        // entryId: normalizedPath,
        rawEntryId: dependencyKey,
        kind: LockfileEntryFilter.Package,
        rawYamlData: dependencyValue
      });

      allPackages.push(currEntry);
      allEntries.push(currEntry);
      allEntriesById[dependencyKey] = currEntry;
    }
  }

  // Construct the graph
  for (const entry of allEntries) {
    for (const dependency of entry.dependencies) {
      // Peer dependencies do not have a matching entry
      if (dependency.dependencyType === IDependencyType.PEER_DEPENDENCY) {
        continue;
      }

      const matchedEntry = allEntriesById[dependency.entryId];
      if (matchedEntry) {
        // Create a two-way link between the dependency and the entry
        dependency.resolvedEntry = matchedEntry;
        matchedEntry.referrers.push(entry);
      } else {
        // Local package
        console.error('Could not resolve dependency entryId: ', dependency.entryId);
      }
    }
  }

  return allEntries;
}

export async function readLockfileAsync(): Promise<LockfileEntry[]> {
  const response = await fetch(`${serviceUrl}/api/lockfile`);
  const lockfile: ILockfilePackageType = await response.json();

  return generateLockfileGraph(lockfile);
}
