// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LfxGraph, LockfileEntry, LockfileEntryFilter } from './LfxGraph';
import { DependencyKind, LockfileDependency } from './LfxGraph';
import { Path } from '@lifaon/path';

enum PnpmLockfileVersion {
  V6,
  V5
}

export interface ILockfileImporterV6 {
  dependencies?: {
    [key: string]: {
      specifier: string;
      version: string;
    };
  };
  devDependencies?: {
    [key: string]: {
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
    [key: string]: ILockfileImporterV5 | ILockfileImporterV6;
  };
  packages?: {
    [key: string]: {
      resolution: {
        integrity: string;
      };
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      dev: boolean;
    };
  };
}

export interface ILockfileNode {
  dependencies?: {
    [key: string]: string;
  };
  devDependencies?: {
    [key: string]: string;
  };
  peerDependencies?: {
    [key: string]: string;
  };
  peerDependenciesMeta?: {
    [key: string]: {
      optional: boolean;
    };
  };
  transitivePeerDependencies?: string[];
}

const packageEntryIdRegex: RegExp = new RegExp('/(.*)/([^/]+)$');

function createLockfileDependency(
  name: string,
  version: string,
  dependencyType: DependencyKind,
  containingEntry: LockfileEntry,
  node?: ILockfileNode
): LockfileDependency {
  const result: LockfileDependency = new LockfileDependency({
    name,
    version,
    dependencyType,
    containingEntry
  });

  if (result.version.startsWith('link:')) {
    const relativePath = result.version.substring('link:'.length);
    const rootRelativePath = new Path('.').relative(
      new Path(containingEntry.packageJsonFolderPath).concat(relativePath)
    );
    if (!rootRelativePath) {
      // eslint-disable-next-line no-console
      console.error('No root relative path for dependency!', name);
      return result;
    }
    result.entryId = 'project:' + rootRelativePath.toString();
  } else if (result.version.startsWith('/')) {
    result.entryId = result.version;
  } else if (result.dependencyType === DependencyKind.PEER_DEPENDENCY) {
    if (node?.peerDependencies) {
      result.peerDependencyMeta = {
        name: result.name,
        version: node.peerDependencies[result.name],
        optional:
          node.peerDependenciesMeta && node.peerDependenciesMeta[result.name]
            ? node.peerDependenciesMeta[result.name].optional
            : false
      };
      result.entryId = 'Peer: ' + result.name;
    } else {
      // eslint-disable-next-line no-console
      console.error('Peer dependencies info missing!', node);
    }
  } else {
    result.entryId = '/' + result.name + '/' + result.version;
  }
  return result;
}

// node is the yaml entry that we are trying to parse
function parseDependencies(
  dependencies: LockfileDependency[],
  lockfileEntry: LockfileEntry,
  node: ILockfileNode
): void {
  if (node.dependencies) {
    for (const [pkgName, pkgVersion] of Object.entries(node.dependencies)) {
      dependencies.push(
        createLockfileDependency(pkgName, pkgVersion, DependencyKind.DEPENDENCY, lockfileEntry)
      );
    }
  }
  if (node.devDependencies) {
    for (const [pkgName, pkgVersion] of Object.entries(node.devDependencies)) {
      dependencies.push(
        createLockfileDependency(pkgName, pkgVersion, DependencyKind.DEV_DEPENDENCY, lockfileEntry)
      );
    }
  }
  if (node.peerDependencies) {
    for (const [pkgName, pkgVersion] of Object.entries(node.peerDependencies)) {
      dependencies.push(
        createLockfileDependency(pkgName, pkgVersion, DependencyKind.PEER_DEPENDENCY, lockfileEntry, node)
      );
    }
  }
  if (node.transitivePeerDependencies) {
    for (const dep of node.transitivePeerDependencies) {
      lockfileEntry.transitivePeerDependencies.add(dep);
    }
  }
}

function createLockfileEntry(options: {
  rawEntryId: string;
  kind: LockfileEntryFilter;
  rawYamlData: ILockfileNode;
  duplicates?: Set<string>;
  subspaceName?: string;
}): LockfileEntry {
  const { rawEntryId, kind, rawYamlData, duplicates, subspaceName } = options;

  const result = new LockfileEntry(kind);

  result.rawEntryId = rawEntryId;

  if (rawEntryId === '.') {
    // Project Root
    return result;
  }

  if (kind === LockfileEntryFilter.Project) {
    const rootPackageJsonFolderPath = new Path(`common/temp/${subspaceName}/package.json`).dirname() || '';
    const packageJsonFolderPath = new Path('.').relative(
      new Path(rootPackageJsonFolderPath).concat(rawEntryId)
    );
    const packageName = new Path(rawEntryId).basename();

    if (!packageJsonFolderPath || !packageName) {
      // eslint-disable-next-line no-console
      console.error('Could not construct path for entry: ', rawEntryId);
      return result;
    }

    result.packageJsonFolderPath = packageJsonFolderPath.toString();
    result.entryId = 'project:' + result.packageJsonFolderPath;
    result.entryPackageName = packageName.toString();
    if (duplicates?.has(result.entryPackageName)) {
      const fullPath = new Path(rawEntryId).makeAbsolute('/').toString().substring(1);
      result.displayText = `Project: ${result.entryPackageName} (${fullPath})`;
      result.entryPackageName = `${result.entryPackageName} (${fullPath})`;
    } else {
      result.displayText = 'Project: ' + result.entryPackageName;
    }
  } else {
    result.displayText = rawEntryId;

    const match = packageEntryIdRegex.exec(rawEntryId);

    if (match) {
      const [, packageName, versionPart] = match;
      result.entryPackageName = packageName;

      const underscoreIndex = versionPart.indexOf('_');
      if (underscoreIndex >= 0) {
        const version = versionPart.substring(0, underscoreIndex);
        const suffix = versionPart.substring(underscoreIndex + 1);

        result.entryPackageVersion = version;
        result.entrySuffix = suffix;

        //       /@rushstack/eslint-config/3.0.1_eslint@8.21.0+typescript@4.7.4
        // -->   @rushstack/eslint-config 3.0.1 (eslint@8.21.0+typescript@4.7.4)
        result.displayText = packageName + ' ' + version + ' (' + suffix + ')';
      } else {
        result.entryPackageVersion = versionPart;

        //       /@rushstack/eslint-config/3.0.1
        // -->   @rushstack/eslint-config 3.0.1
        result.displayText = packageName + ' ' + versionPart;
      }
    }

    // Example:
    //   common/temp/default/node_modules/.pnpm
    //     /@babel+register@7.17.7_@babel+core@7.17.12
    //     /node_modules/@babel/register
    result.packageJsonFolderPath =
      `common/temp/${subspaceName}/node_modules/.pnpm/` +
      result.entryPackageName.replace('/', '+') +
      '@' +
      result.entryPackageVersion +
      (result.entrySuffix ? `_${result.entrySuffix}` : '') +
      '/node_modules/' +
      result.entryPackageName;
  }

  parseDependencies(result.dependencies, result, rawYamlData);

  return result;
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
    for (const [depName, depDetails] of Object.entries(v6ImporterValue.dependencies ?? {})) {
      v5ImporterValue.specifiers![depName] = depDetails.specifier;
      v5ImporterValue.dependencies![depName] = depDetails.version;
    }
    for (const [depName, depDetails] of Object.entries(v6ImporterValue.devDependencies ?? {})) {
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
export function generateLockfileGraph(lockfile: ILockfilePackageType, subspaceName?: string): LfxGraph {
  let pnpmLockfileVersion: PnpmLockfileVersion = PnpmLockfileVersion.V5;
  if (`${lockfile.lockfileVersion}`.startsWith('6')) {
    pnpmLockfileVersion = PnpmLockfileVersion.V6;
  }
  const allEntries: LockfileEntry[] = [];
  const allEntriesById: { [key: string]: LockfileEntry } = {};

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
      const importer: LockfileEntry = createLockfileEntry({
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

      const currEntry: LockfileEntry = createLockfileEntry({
        // entryId: normalizedPath,
        rawEntryId: dependencyKey,
        kind: LockfileEntryFilter.Package,
        rawYamlData: dependencyValue,
        subspaceName
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
      if (dependency.dependencyType === DependencyKind.PEER_DEPENDENCY) {
        continue;
      }

      const matchedEntry = allEntriesById[dependency.entryId];
      if (matchedEntry) {
        // Create a two-way link between the dependency and the entry
        dependency.resolvedEntry = matchedEntry;
        matchedEntry.referrers.push(entry);
      } else {
        if (dependency.entryId.startsWith('/')) {
          // Local package
          // eslint-disable-next-line no-console
          console.error('Could not resolve dependency entryId: ', dependency.entryId, dependency);
        }
      }
    }
  }

  const lfxGraph: LfxGraph = new LfxGraph();
  lfxGraph.entries = allEntries;
  return lfxGraph;
}
