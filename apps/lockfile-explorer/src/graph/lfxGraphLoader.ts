// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as lockfileTypes from '@pnpm/lockfile.types';
import type * as pnpmTypes from '@pnpm/types';

import { Text } from '@rushstack/node-core-library';

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
type PeerDependenciesMeta = lockfileTypes.LockfilePackageInfo['peerDependenciesMeta'];

function createPackageLockfileDependency(options: {
  name: string;
  version: string;
  kind: LfxDependencyKind;
  containingEntry: LfxGraphEntry;
  peerDependenciesMeta?: PeerDependenciesMeta;
  pnpmLockfileVersion: PnpmLockfileVersion;
  workspace: IJsonLfxWorkspace;
}): LfxGraphDependency {
  const {
    name,
    version,
    kind: dependencyType,
    containingEntry,
    peerDependenciesMeta,
    pnpmLockfileVersion
  } = options;

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

    if (containingEntry.kind === LfxGraphEntryKind.Project) {
      // TODO: Here we assume it's a "workspace:" link and try to resolve it to another workspace project,
      // but it could also be a link to an arbitrary folder (in which case this entryId will fail to resolve).
      // In the future, we should distinguish these cases.
      const selfRelativePath: string = lockfilePath.getAbsolute(
        containingEntry.packageJsonFolderPath,
        relativePath
      );
      result.entryId = 'project:' + selfRelativePath.toString();
    } else {
      // This could be a link to anywhere on the local computer, so we don't expect it to have a lockfile entry
      result.entryId = '';
    }
  } else if (result.version.startsWith('/')) {
    result.entryId = version;
  } else if (result.dependencyType === LfxDependencyKind.Peer) {
    result.peerDependencyMeta = {
      name: result.name,
      version: version,
      optional: peerDependenciesMeta?.[result.name] ? peerDependenciesMeta[result.name].optional : false
    };
    result.entryId = 'Peer: ' + result.name;
  } else {
    // Version 5.4: /@rushstack/m/1.0.0:
    // Version 6.0: /@rushstack/m@1.0.0:
    //
    // Version 5.4: /@rushstack/j/1.0.0_@rushstack+n@2.0.0
    // Version 6.0: /@rushstack/j@1.0.0(@rushstack/n@2.0.0)
    const versionDelimiter: string = pnpmLockfileVersion === 54 ? '/' : '@';
    result.entryId = '/' + result.name + versionDelimiter + result.version;
  }
  return new LfxGraphDependency(result);
}

// v5.4 used this to parse projects ("importers") also
function parsePackageDependencies(
  dependencies: LfxGraphDependency[],
  lockfileEntry: LfxGraphEntry,
  either: lockfileTypes.ProjectSnapshot | lockfileTypes.PackageSnapshot,
  pnpmLockfileVersion: PnpmLockfileVersion,
  workspace: IJsonLfxWorkspace
): void {
  const node: Partial<lockfileTypes.ProjectSnapshot & lockfileTypes.PackageSnapshot> =
    either as unknown as Partial<lockfileTypes.ProjectSnapshot & lockfileTypes.PackageSnapshot>;
  if (node.dependencies) {
    for (const [packageName, version] of Object.entries(node.dependencies)) {
      dependencies.push(
        createPackageLockfileDependency({
          kind: LfxDependencyKind.Regular,
          name: packageName,
          version: version,
          containingEntry: lockfileEntry,
          pnpmLockfileVersion,
          workspace
        })
      );
    }
  }
  if (node.devDependencies) {
    for (const [packageName, version] of Object.entries(node.devDependencies)) {
      dependencies.push(
        createPackageLockfileDependency({
          kind: LfxDependencyKind.Dev,
          name: packageName,
          version: version,
          containingEntry: lockfileEntry,
          pnpmLockfileVersion,
          workspace
        })
      );
    }
  }
  if (node.peerDependencies) {
    for (const [packageName, version] of Object.entries(node.peerDependencies)) {
      dependencies.push(
        createPackageLockfileDependency({
          kind: LfxDependencyKind.Peer,
          name: packageName,
          version: version,
          containingEntry: lockfileEntry,
          peerDependenciesMeta: node.peerDependenciesMeta,
          pnpmLockfileVersion,
          workspace
        })
      );
    }
  }
  if (node.transitivePeerDependencies) {
    for (const dep of node.transitivePeerDependencies) {
      lockfileEntry.transitivePeerDependencies.add(dep);
    }
  }
}

function parseProjectDependencies60(
  dependencies: LfxGraphDependency[],
  lockfileEntry: LfxGraphEntry,
  snapshot: lockfileTypes.LockfileFileProjectSnapshot,
  pnpmLockfileVersion: PnpmLockfileVersion,
  workspace: IJsonLfxWorkspace
): void {
  if (snapshot.dependencies) {
    for (const [packageName, specifierAndResolution] of Object.entries(snapshot.dependencies)) {
      dependencies.push(
        createPackageLockfileDependency({
          kind: LfxDependencyKind.Regular,
          name: packageName,
          version: specifierAndResolution.version,
          containingEntry: lockfileEntry,
          pnpmLockfileVersion,
          workspace
        })
      );
    }
  }
  if (snapshot.devDependencies) {
    for (const [packageName, specifierAndResolution] of Object.entries(snapshot.devDependencies)) {
      dependencies.push(
        createPackageLockfileDependency({
          kind: LfxDependencyKind.Dev,
          name: packageName,
          version: specifierAndResolution.version,
          containingEntry: lockfileEntry,
          pnpmLockfileVersion,
          workspace
        })
      );
    }
  }
}

function createProjectLockfileEntry(options: {
  rawEntryId: string;
  duplicates?: Set<string>;
  workspace: IJsonLfxWorkspace;
  pnpmLockfileVersion: PnpmLockfileVersion;
}): LfxGraphEntry {
  const { rawEntryId, duplicates, workspace } = options;

  const result: ILfxGraphEntryOptions = {
    kind: LfxGraphEntryKind.Project,
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

  const lockfileEntry: LfxGraphEntry = new LfxGraphEntry(result);
  return lockfileEntry;
}

function createPackageLockfileEntry(options: {
  rawEntryId: string;
  rawYamlData: lockfileTypes.PackageSnapshot;
  workspace: IJsonLfxWorkspace;
  pnpmLockfileVersion: PnpmLockfileVersion;
}): LfxGraphEntry {
  const { rawEntryId, rawYamlData, pnpmLockfileVersion, workspace } = options;

  const result: ILfxGraphEntryOptions = {
    kind: LfxGraphEntryKind.Package,
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

  result.displayText = rawEntryId;

  if (!rawEntryId.startsWith('/')) {
    throw new Error('Expecting leading "/" in path: ' + JSON.stringify(rawEntryId));
  }

  let dotPnpmSubfolder: string;

  if (pnpmLockfileVersion === 54) {
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

    // Example: @babel+register@7.17.7_@babel+core@7.17.12
    dotPnpmSubfolder =
      result.entryPackageName.replace('/', '+') +
      '@' +
      result.entryPackageVersion +
      (result.entrySuffix ? `_${result.entrySuffix}` : '');
  } else {
    // Example inputs:
    //       /@rushstack/eslint-config@3.0.1
    //       /@rushstack/l@1.0.0(@rushstack/m@1.0.0)(@rushstack/n@2.0.0)
    let versionAtSignIndex: number;
    if (rawEntryId.startsWith('/@')) {
      versionAtSignIndex = rawEntryId.indexOf('@', 2);
    } else {
      versionAtSignIndex = rawEntryId.indexOf('@', 1);
    }
    const packageName: string = rawEntryId.substring(1, versionAtSignIndex);
    result.entryPackageName = packageName;

    const leftParenIndex: number = rawEntryId.indexOf('(', versionAtSignIndex);
    if (leftParenIndex < 0) {
      const version: string = rawEntryId.substring(versionAtSignIndex + 1);
      result.entryPackageVersion = version;

      //       /@rushstack/eslint-config@3.0.1
      // -->   @rushstack/eslint-config 3.0.1
      result.displayText = packageName + ' ' + version;
    } else {
      const version: string = rawEntryId.substring(versionAtSignIndex + 1, leftParenIndex);
      result.entryPackageVersion = version;

      // "(@rushstack/m@1.0.0)(@rushstack/n@2.0.0)"
      let suffix: string = rawEntryId.substring(leftParenIndex);

      // Rewrite to:
      // "@rushstack/m@1.0.0; @rushstack/n@2.0.0"
      suffix = Text.replaceAll(suffix, ')(', '; ');
      suffix = Text.replaceAll(suffix, '(', '');
      suffix = Text.replaceAll(suffix, ')', '');
      result.entrySuffix = suffix;

      //       /@rushstack/l@1.0.0(@rushstack/m@1.0.0)(@rushstack/n@2.0.0)
      // -->   @rushstack/l 1.0.0 [@rushstack/m@1.0.0; @rushstack/n@2.0.0]
      result.displayText = packageName + ' ' + version + ' [' + suffix + ']';
    }

    // Example: /@rushstack/l@1.0.0(@rushstack/m@1.0.0)(@rushstack/n@2.0.0)
    // -->       @rushstack+l@1.0.0_@rushstack+m@1.0.0_@rushstack+n@2.0.0

    // @rushstack/l 1.0.0 (@rushstack/m@1.0.0)(@rushstack/n@2.0.0)
    dotPnpmSubfolder = rawEntryId.substring(1);
    dotPnpmSubfolder = Text.replaceAll(dotPnpmSubfolder, '/', '+');
    dotPnpmSubfolder = Text.replaceAll(dotPnpmSubfolder, ')(', '_');
    dotPnpmSubfolder = Text.replaceAll(dotPnpmSubfolder, '(', '_');
    dotPnpmSubfolder = Text.replaceAll(dotPnpmSubfolder, ')', '');
  }

  // Example:
  //   common/temp/default/node_modules/.pnpm
  //     /@babel+register@7.17.7_@babel+core@7.17.12
  //     /node_modules/@babel/register
  result.packageJsonFolderPath = lockfilePath.join(
    pnpmLockfileFolder,
    `node_modules/.pnpm/` + dotPnpmSubfolder + '/node_modules/' + result.entryPackageName
  );

  const lockfileEntry: LfxGraphEntry = new LfxGraphEntry(result);
  parsePackageDependencies(
    lockfileEntry.dependencies,
    lockfileEntry,
    rawYamlData,
    pnpmLockfileVersion,
    workspace
  );
  return lockfileEntry;
}

/**
 * Parse through the lockfile and create all the corresponding LockfileEntries and LockfileDependencies
 * to construct the lockfile graph.
 *
 * @returns A list of all the LockfileEntries in the lockfile.
 */
export function generateLockfileGraph(lockfileJson: unknown, workspace: IJsonLfxWorkspace): LfxGraph {
  const lockfile: lockfileTypes.LockfileObject | lockfileTypes.LockfileFile = lockfileJson as
    | lockfileTypes.LockfileObject
    | lockfileTypes.LockfileFile;

  let pnpmLockfileVersion: PnpmLockfileVersion;
  switch (lockfile.lockfileVersion.toString()) {
    case '5.4':
      pnpmLockfileVersion = 54;
      break;
    case '6':
    case '6.0':
      pnpmLockfileVersion = 60;
      break;
    //case '9':
    //case '9.0':
    //  pnpmLockfileVersion = 90;
    //  break;
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
        continue;
      }

      const importer: LfxGraphEntry = createProjectLockfileEntry({
        rawEntryId: importerKey,
        duplicates,
        workspace,
        pnpmLockfileVersion
      });

      if (pnpmLockfileVersion === 54) {
        const lockfile54: lockfileTypes.LockfileObject = lockfileJson as lockfileTypes.LockfileObject;
        const importerValue: lockfileTypes.ProjectSnapshot =
          lockfile54.importers[importerKey as pnpmTypes.ProjectId];
        parsePackageDependencies(
          importer.dependencies,
          importer,
          importerValue,
          pnpmLockfileVersion,
          workspace
        );
      } else {
        const lockfile60: lockfileTypes.LockfileFile = lockfileJson as lockfileTypes.LockfileFile;
        if (lockfile60.importers) {
          const importerValue: lockfileTypes.LockfileFileProjectSnapshot =
            lockfile60.importers[importerKey as pnpmTypes.ProjectId];
          parseProjectDependencies60(
            importer.dependencies,
            importer,
            importerValue,
            pnpmLockfileVersion,
            workspace
          );
        }
      }

      allImporters.push(importer);
      allEntries.push(importer);
      allEntriesById.set(importer.entryId, importer);
    }
  }

  const allPackages: LfxGraphEntry[] = [];
  if (lockfile.packages) {
    for (const [dependencyKey, dependencyValue] of Object.entries(lockfile.packages ?? {})) {
      // const normalizedPath = new Path(dependencyKey).makeAbsolute('/').toString();

      const currEntry: LfxGraphEntry = createPackageLockfileEntry({
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
