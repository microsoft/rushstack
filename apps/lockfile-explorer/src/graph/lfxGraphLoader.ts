// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Path } from '@lifaon/path';
import type * as lockfileTypes from '@pnpm/lockfile-types';
import type * as pnpmTypes from '@pnpm/types';

import {
  type ILfxGraphDependencyOptions,
  type ILfxGraphEntryOptions,
  LfxGraph,
  LfxGraphEntry,
  LfxGraphEntryKind,
  LfxDependencyKind,
  LfxGraphDependency,
  type IJsonLfxWorkspace
} from '../../build/lfx-shared';

import { convertLockfileV6DepPathToV5DepPath } from '../utils/shrinkwrap';

enum PnpmLockfileVersion {
  V6,
  V5
}

const packageEntryIdRegex: RegExp = new RegExp('/(.*)/([^/]+)$');

function createLockfileDependency(
  name: string,
  version: string,
  dependencyType: LfxDependencyKind,
  containingEntry: LfxGraphEntry,
  node?: lockfileTypes.PackageSnapshot
): LfxGraphDependency {
  const result: ILfxGraphDependencyOptions = {
    name,
    version,
    dependencyType,
    containingEntry,
    entryId: '',
    peerDependencyMeta: {}
  };

  if (version.startsWith('link:')) {
    const relativePath: string = version.substring('link:'.length);
    const rootRelativePath: Path | null = new Path('.').relative(
      new Path(containingEntry.packageJsonFolderPath).concat(relativePath)
    );
    if (!rootRelativePath) {
      console.error('No root relative path for dependency!', name);
      return new LfxGraphDependency(result);
    }
    result.entryId = 'project:' + rootRelativePath.toString();
  } else if (result.version.startsWith('/')) {
    result.entryId = version;
  } else if (result.dependencyType === LfxDependencyKind.Peer) {
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
      console.error('Peer dependencies info missing!', node);
    }
  } else {
    result.entryId = '/' + result.name + '/' + result.version;
  }
  return new LfxGraphDependency(result);
}

// node is the yaml entry that we are trying to parse
function parseDependencies(
  dependencies: LfxGraphDependency[],
  lockfileEntry: LfxGraphEntry,
  either: lockfileTypes.ProjectSnapshot | lockfileTypes.PackageSnapshot
): void {
  const node: lockfileTypes.ProjectSnapshot & lockfileTypes.PackageSnapshot =
    either as unknown as lockfileTypes.ProjectSnapshot & lockfileTypes.PackageSnapshot;
  if (node.dependencies) {
    for (const [pkgName, pkgVersion] of Object.entries(node.dependencies)) {
      dependencies.push(
        createLockfileDependency(pkgName, pkgVersion, LfxDependencyKind.Regular, lockfileEntry)
      );
    }
  }
  if (node.devDependencies) {
    for (const [pkgName, pkgVersion] of Object.entries(node.devDependencies)) {
      dependencies.push(createLockfileDependency(pkgName, pkgVersion, LfxDependencyKind.Dev, lockfileEntry));
    }
  }
  if (node.peerDependencies) {
    for (const [pkgName, pkgVersion] of Object.entries(node.peerDependencies)) {
      dependencies.push(
        createLockfileDependency(pkgName, pkgVersion, LfxDependencyKind.Peer, lockfileEntry, node)
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
  kind: LfxGraphEntryKind;
  rawYamlData: lockfileTypes.PackageSnapshot | lockfileTypes.ProjectSnapshot;
  duplicates?: Set<string>;
  subspaceName?: string;
}): LfxGraphEntry {
  const { rawEntryId, kind, rawYamlData, duplicates, subspaceName } = options;

  const result: ILfxGraphEntryOptions = {
    kind,
    entryId: '',
    rawEntryId: '',
    packageJsonFolderPath: '',
    entryPackageName: '',
    displayText: '',
    entryPackageVersion: '',
    entrySuffix: ''
  };

  result.rawEntryId = rawEntryId;

  if (rawEntryId === '.') {
    // Project Root
    return new LfxGraphEntry(result);
  }

  if (kind === LfxGraphEntryKind.Project) {
    const rootPackageJsonFolderPath: '' | Path =
      new Path(`common/temp/${subspaceName}/package.json`).dirname() || '';
    const packageJsonFolderPath: Path | null = new Path('.').relative(
      new Path(rootPackageJsonFolderPath).concat(rawEntryId)
    );
    const packageName: string | null = new Path(rawEntryId).basename();

    if (!packageJsonFolderPath || !packageName) {
      console.error('Could not construct path for entry: ', rawEntryId);
      return new LfxGraphEntry(result);
    }

    result.packageJsonFolderPath = packageJsonFolderPath.toString();
    result.entryId = 'project:' + result.packageJsonFolderPath;
    result.entryPackageName = packageName.toString();
    if (duplicates?.has(result.entryPackageName)) {
      const fullPath: string = new Path(rawEntryId).makeAbsolute('/').toString().substring(1);
      result.displayText = `Project: ${result.entryPackageName} (${fullPath})`;
      result.entryPackageName = `${result.entryPackageName} (${fullPath})`;
    } else {
      result.displayText = 'Project: ' + result.entryPackageName;
    }
  } else {
    result.displayText = rawEntryId;

    const match: RegExpExecArray | null = packageEntryIdRegex.exec(rawEntryId);

    if (match) {
      const [, packageName, versionPart] = match;
      result.entryPackageName = packageName;

      const underscoreIndex: number = versionPart.indexOf('_');
      if (underscoreIndex >= 0) {
        const version: string = versionPart.substring(0, underscoreIndex);
        const suffix: string = versionPart.substring(underscoreIndex + 1);

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

  const lockfileEntry: LfxGraphEntry = new LfxGraphEntry(result);
  parseDependencies(lockfileEntry.dependencies, lockfileEntry, rawYamlData);
  return lockfileEntry;
}

/**
 * Parse through the lockfile and create all the corresponding LockfileEntries and LockfileDependencies
 * to construct the lockfile graph.
 *
 * @returns A list of all the LockfileEntries in the lockfile.
 */
export function generateLockfileGraph(
  workspace: IJsonLfxWorkspace,
  lockfileJson: unknown,
  subspaceName?: string
): LfxGraph {
  const lockfile: lockfileTypes.Lockfile = lockfileJson as lockfileTypes.Lockfile;
  let pnpmLockfileVersion: PnpmLockfileVersion = PnpmLockfileVersion.V5;
  if (parseInt(lockfile.lockfileVersion.toString(), 10) === 6) {
    pnpmLockfileVersion = PnpmLockfileVersion.V6;
  }

  if (lockfile.packages && pnpmLockfileVersion === PnpmLockfileVersion.V6) {
    const updatedPackages: lockfileTypes.PackageSnapshots = {};
    for (const [dependencyPath, dependency] of Object.entries(lockfile.packages)) {
      updatedPackages[convertLockfileV6DepPathToV5DepPath(dependencyPath) as pnpmTypes.DepPath] = dependency;
    }
    lockfile.packages = updatedPackages;
  }

  const lfxGraph: LfxGraph = new LfxGraph(workspace);
  const allEntries: LfxGraphEntry[] = lfxGraph.entries;
  const allEntriesById: { [key: string]: LfxGraphEntry } = {};

  const allImporters: LfxGraphEntry[] = [];
  if (lockfile.importers) {
    // Find duplicate importer names
    const baseNames: Set<string> = new Set();
    const duplicates: Set<string> = new Set();
    for (const importerKey of Object.keys(lockfile.importers)) {
      const baseName: string | null = new Path(importerKey).basename();
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
      const importer: LfxGraphEntry = createLockfileEntry({
        // entryId: normalizedPath,
        rawEntryId: importerKey,
        kind: LfxGraphEntryKind.Project,
        rawYamlData: importerValue,
        duplicates,
        subspaceName
      });
      allImporters.push(importer);
      allEntries.push(importer);
      allEntriesById[importer.entryId] = importer;
    }
  }

  const allPackages: LfxGraphEntry[] = [];
  if (lockfile.packages) {
    for (const [dependencyKey, dependencyValue] of Object.entries(lockfile.packages ?? {})) {
      // const normalizedPath = new Path(dependencyKey).makeAbsolute('/').toString();

      const currEntry: LfxGraphEntry = createLockfileEntry({
        // entryId: normalizedPath,
        rawEntryId: dependencyKey,
        kind: LfxGraphEntryKind.Package,
        rawYamlData: dependencyValue as lockfileTypes.PackageSnapshot,
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
      if (dependency.dependencyType === LfxDependencyKind.Peer) {
        continue;
      }

      const matchedEntry: LfxGraphEntry = allEntriesById[dependency.entryId];
      if (matchedEntry) {
        // Create a two-way link between the dependency and the entry
        dependency.resolvedEntry = matchedEntry;
        matchedEntry.referrers.push(entry);
      } else {
        if (dependency.entryId.startsWith('/')) {
          // Local package
          console.error('Could not resolve dependency entryId: ', dependency.entryId, dependency);
        }
      }
    }
  }

  return lfxGraph;
}
