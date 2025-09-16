// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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
import * as lockfilePath from './lockfilePath';

type PnpmLockfileVersion = 54 | 60 | 90;

function createLockfileDependency(
  name: string,
  version: string,
  dependencyType: LfxDependencyKind,
  containingEntry: LfxGraphEntry,
  node: Partial<lockfileTypes.PackageSnapshot> | undefined,
  workspace: IJsonLfxWorkspace
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
    const rootRelativePath: string = lockfilePath.getAbsolute(
      containingEntry.packageJsonFolderPath,
      relativePath
    );
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
  either: lockfileTypes.ProjectSnapshot | lockfileTypes.PackageSnapshot,
  workspace: IJsonLfxWorkspace
): void {
  const node: Partial<lockfileTypes.ProjectSnapshot & lockfileTypes.PackageSnapshot> =
    either as unknown as Partial<lockfileTypes.ProjectSnapshot & lockfileTypes.PackageSnapshot>;
  if (node.dependencies) {
    for (const [pkgName, pkgVersion] of Object.entries(node.dependencies)) {
      dependencies.push(
        createLockfileDependency(
          pkgName,
          pkgVersion,
          LfxDependencyKind.Regular,
          lockfileEntry,
          undefined,
          workspace
        )
      );
    }
  }
  if (node.devDependencies) {
    for (const [pkgName, pkgVersion] of Object.entries(node.devDependencies)) {
      dependencies.push(
        createLockfileDependency(
          pkgName,
          pkgVersion,
          LfxDependencyKind.Dev,
          lockfileEntry,
          undefined,
          workspace
        )
      );
    }
  }
  if (node.peerDependencies) {
    for (const [pkgName, pkgVersion] of Object.entries(node.peerDependencies)) {
      dependencies.push(
        createLockfileDependency(pkgName, pkgVersion, LfxDependencyKind.Peer, lockfileEntry, node, workspace)
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
  workspace: IJsonLfxWorkspace;
  pnpmLockfileVersion: PnpmLockfileVersion;
}): LfxGraphEntry {
  const { rawEntryId, kind, rawYamlData, duplicates, pnpmLockfileVersion, workspace } = options;

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

  // Example: pnpmLockfilePath   = 'common/temp/my-subspace/pnpm-lock.yaml'
  // Example: pnpmLockfileFolder = 'common/temp/my-subspace'
  const pnpmLockfileFolder: string = workspace.pnpmLockfileFolder;

  if (kind === LfxGraphEntryKind.Project) {
    // Example: rawEntryId = '../../../projects/a'
    // Example: packageJsonFolderPath = 'projects/a'
    result.packageJsonFolderPath = lockfilePath.getAbsolute(pnpmLockfileFolder, rawEntryId);
    result.entryId = 'project:' + result.packageJsonFolderPath;

    const projectFolderName: string = lockfilePath.getBaseNameOf(rawEntryId);

    if (!duplicates?.has(projectFolderName)) {
      // TODO: The actual package.json name might not match its directory name,
      // but we have to load package.json to determine it.
      result.entryPackageName = projectFolderName;
    } else {
      result.entryPackageName = `${projectFolderName} (${result.packageJsonFolderPath})`;
    }
    result.displayText = `Project: ${result.entryPackageName}`;
  } else {
    result.displayText = rawEntryId;

    if (pnpmLockfileVersion === 54) {
      if (!rawEntryId.startsWith('/')) {
        throw new Error('Expecting leading "/" in path: ' + JSON.stringify(rawEntryId));
      }
      const lastSlashIndex: number = rawEntryId.lastIndexOf('/');
      if (lastSlashIndex < 0) {
        throw new Error('Expecting "/" in path: ' + JSON.stringify(rawEntryId));
      }
      const packageName: string = rawEntryId.substring(1, lastSlashIndex);
      result.entryPackageName = packageName;

      //       /@rushstack/eslint-config/3.0.1_eslint@8.21.0+typescript@4.7.4
      // -->   @rushstack/eslint-config 3.0.1 (eslint@8.21.0+typescript@4.7.4)
      const underscoreIndex: number = rawEntryId.indexOf('_', lastSlashIndex);
      if (underscoreIndex > 0) {
        const version: string = rawEntryId.substring(lastSlashIndex + 1, underscoreIndex);
        const suffix: string = rawEntryId.substring(underscoreIndex + 1);
        result.displayText = packageName + ' ' + version + ' (' + suffix + ')';
        result.entryPackageVersion = version;
        result.entrySuffix = suffix;
      } else {
        //       /@rushstack/eslint-config/3.0.1
        // -->   @rushstack/eslint-config 3.0.1
        const version: string = rawEntryId.substring(lastSlashIndex + 1);
        result.displayText = packageName + ' ' + version;
        result.entryPackageVersion = version;
      }
    }

    // Example: @babel+register@7.17.7_@babel+core@7.17.12
    const dotPnpmSubfolder: string =
      result.entryPackageName.replace('/', '+') +
      '@' +
      result.entryPackageVersion +
      (result.entrySuffix ? `_${result.entrySuffix}` : '');

    // Example:
    //   common/temp/default/node_modules/.pnpm
    //     /@babel+register@7.17.7_@babel+core@7.17.12
    //     /node_modules/@babel/register
    result.packageJsonFolderPath = lockfilePath.join(
      pnpmLockfileFolder,
      `node_modules/.pnpm/` + dotPnpmSubfolder + '/node_modules/' + result.entryPackageName
    );
  }

  const lockfileEntry: LfxGraphEntry = new LfxGraphEntry(result);
  parseDependencies(lockfileEntry.dependencies, lockfileEntry, rawYamlData, workspace);
  return lockfileEntry;
}

/**
 * Parse through the lockfile and create all the corresponding LockfileEntries and LockfileDependencies
 * to construct the lockfile graph.
 *
 * @returns A list of all the LockfileEntries in the lockfile.
 */
export function generateLockfileGraph(lockfileJson: unknown, workspace: IJsonLfxWorkspace): LfxGraph {
  const lockfile: lockfileTypes.Lockfile = lockfileJson as lockfileTypes.Lockfile;

  let pnpmLockfileVersion: PnpmLockfileVersion;
  switch (lockfile.lockfileVersion.toString()) {
    case '5.4':
      pnpmLockfileVersion = 54;
      break;
    case '6':
    case '6.0':
      pnpmLockfileVersion = 60;
      break;
    case '9':
    case '9.0':
      pnpmLockfileVersion = 90;
      break;
    default:
      throw new Error('Unsupported PNPM lockfile version ' + JSON.stringify(lockfile.lockfileVersion));
  }

  const lfxGraph: LfxGraph = new LfxGraph(workspace);
  const allEntries: LfxGraphEntry[] = lfxGraph.entries;
  const allEntriesById: Map<string, LfxGraphEntry> = new Map();

  const allImporters: LfxGraphEntry[] = [];

  // "Importers" are the local workspace projects
  if (lockfile.importers) {
    // Normally the UX shows the concise project folder name.  However in the case of duplicates
    // (where two projects use the same folder name), then we will need to disambiguate.
    const baseNames: Set<string> = new Set();
    const duplicates: Set<string> = new Set();
    for (const importerKey of Object.keys(lockfile.importers)) {
      const baseName: string = lockfilePath.getBaseNameOf(importerKey);
      if (baseNames.has(baseName)) {
        duplicates.add(baseName);
      }
      baseNames.add(baseName);
    }

    const isRushWorkspace: boolean = workspace.rushConfig !== undefined;

    for (const importerKey of Object.keys(lockfile.importers)) {
      if (isRushWorkspace && importerKey === '.') {
        // Discard the synthetic package.json file created by Rush under common/temp
        //        continue;
      }

      const importerValue: lockfileTypes.ProjectSnapshot =
        lockfile.importers[importerKey as pnpmTypes.ProjectId];

      const importer: LfxGraphEntry = createLockfileEntry({
        kind: LfxGraphEntryKind.Project,
        rawEntryId: importerKey,
        rawYamlData: importerValue,
        duplicates,
        workspace,
        pnpmLockfileVersion
      });
      allImporters.push(importer);
      allEntries.push(importer);
      allEntriesById.set(importer.entryId, importer);
    }
  }

  const allPackages: LfxGraphEntry[] = [];
  if (lockfile.packages) {
    for (const [dependencyKey, dependencyValue] of Object.entries(lockfile.packages ?? {})) {
      // const normalizedPath = new Path(dependencyKey).makeAbsolute('/').toString();

      const currEntry: LfxGraphEntry = createLockfileEntry({
        kind: LfxGraphEntryKind.Package,
        rawEntryId: dependencyKey,
        rawYamlData: dependencyValue as lockfileTypes.PackageSnapshot,
        workspace,
        pnpmLockfileVersion
      });

      allPackages.push(currEntry);
      allEntries.push(currEntry);
      allEntriesById.set(dependencyKey, currEntry);
    }
  }

  // Construct the graph
  for (const entry of allEntries) {
    for (const dependency of entry.dependencies) {
      // Peer dependencies do not have a matching entry
      if (dependency.dependencyType === LfxDependencyKind.Peer) {
        continue;
      }

      const matchedEntry: LfxGraphEntry | undefined = allEntriesById.get(dependency.entryId);
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
