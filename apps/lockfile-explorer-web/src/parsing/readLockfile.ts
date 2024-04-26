// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LockfileEntry, LockfileEntryFilter } from './LockfileEntry';
import { IDependencyType } from './LockfileDependency';
import { Path } from '@lifaon/path';

const serviceUrl: string = window.appContext.serviceUrl;

export enum PnpmLockfileVersion {
  V6,
  V5
}

export interface IPackageJsonType {
  name: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}
export interface ILockfileImporterV6 {
  dependencies?: {
    [key in string]: {
      specifier: string;
      version: string;
    };
  };
  devDependencies?: {
    [key in string]: {
      specifier: string;
      version: string;
    };
  };
}
export interface ILockfileImporterV5 {
  specifiers?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
export interface ILockfilePackageType {
  lockfileVersion: number | string;
  importers?: {
    [key in string]: ILockfileImporterV5 | ILockfileImporterV6;
  };
  packages?: {
    [key in string]: {
      resolution: {
        integrity: string;
      };
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      dev: boolean;
    };
  };
}

/**
 * Transform any newer lockfile formats to the following format:
 * [packageName]:
 *     specifier: ...
 *     version: ...
 */
function getImporterValue(
  importerValue: ILockfileImporterV5 | ILockfileImporterV6,
  pnpmLockfileVersion: PnpmLockfileVersion
): ILockfileImporterV5 {
  if (pnpmLockfileVersion === PnpmLockfileVersion.V6) {
    const v6ImporterValue = importerValue as ILockfileImporterV6;
    const v5ImporterValue: ILockfileImporterV5 = {
      specifiers: {},
      dependencies: {},
      devDependencies: {}
    };
    for (const [depName, depDetails] of Object.entries(v6ImporterValue.dependencies || {})) {
      v5ImporterValue.specifiers![depName] = depDetails.specifier;
      v5ImporterValue.dependencies![depName] = depDetails.version;
    }
    for (const [depName, depDetails] of Object.entries(v6ImporterValue.devDependencies || {})) {
      v5ImporterValue.specifiers![depName] = depDetails.specifier;
      v5ImporterValue.devDependencies![depName] = depDetails.version;
    }
    return v5ImporterValue;
  } else {
    return importerValue as ILockfileImporterV5;
  }
}

/**
 * Parse through the lockfile and create all the corresponding LockfileEntries and LockfileDependencies
 * to construct the lockfile graph.
 *
 * @returns A list of all the LockfileEntries in the lockfile.
 */
export function generateLockfileGraph(
  lockfile: ILockfilePackageType,
  subspaceName?: string
): LockfileEntry[] {
  let pnpmLockfileVersion: PnpmLockfileVersion = PnpmLockfileVersion.V5;
  if (`${lockfile.lockfileVersion}`.startsWith('6')) {
    pnpmLockfileVersion = PnpmLockfileVersion.V6;
  }
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
        rawYamlData: getImporterValue(importerValue, pnpmLockfileVersion),
        duplicates,
        subspaceName
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

      let packageDepKey = dependencyKey;
      if (pnpmLockfileVersion === PnpmLockfileVersion.V6) {
        packageDepKey = dependencyKey.replace('@', '/');
      }

      const currEntry = new LockfileEntry({
        // entryId: normalizedPath,
        rawEntryId: packageDepKey,
        kind: LockfileEntryFilter.Package,
        rawYamlData: dependencyValue
      });

      allPackages.push(currEntry);
      allEntries.push(currEntry);
      allEntriesById[packageDepKey] = currEntry;
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
        // eslint-disable-next-line no-console
        console.error('Could not resolve dependency entryId: ', dependency.entryId, dependency);
      }
    }
  }

  return allEntries;
}

export async function readLockfileAsync(): Promise<LockfileEntry[]> {
  const response = await fetch(`${serviceUrl}/api/lockfile`);
  const lockfile: { doc: ILockfilePackageType; subspaceName: string } = await response.json();

  return generateLockfileGraph(lockfile.doc, lockfile.subspaceName);
}
