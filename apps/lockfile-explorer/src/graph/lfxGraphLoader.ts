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
  versionPath: string;
  originalSpecifier: string;
  kind: LfxDependencyKind;
  containingEntry: LfxGraphEntry;
  peerDependenciesMeta?: PeerDependenciesMeta;
  pnpmLockfileVersion: PnpmLockfileVersion;
  workspace: IJsonLfxWorkspace;
}): LfxGraphDependency {
  const {
    name,
    versionPath,
    originalSpecifier,
    kind: dependencyKind,
    containingEntry,
    peerDependenciesMeta,
    pnpmLockfileVersion
  } = options;

  const result: ILfxGraphDependencyOptions = {
    name,
    versionPath,
    entryId: '',
    originalSpecifier,
    dependencyKind,
    peerDependencyMeta: {},
    containingEntry
  };

  if (versionPath.startsWith('link:')) {
    const relativePath: string = versionPath.substring('link:'.length);

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
  } else if (result.versionPath.startsWith('/')) {
    result.entryId = versionPath;
  } else {
    // Version 5.4: /@rushstack/m/1.0.0:
    // Version 6.0: /@rushstack/m@1.0.0:
    // Version 9.0:  @rushstack/m@1.0.0:
    //
    // Version 5.4: /@rushstack/j/1.0.0_@rushstack+n@2.0.0
    // Version 6.0: /@rushstack/j@1.0.0(@rushstack/n@2.0.0)
    // Version 9.0:  @rushstack/j@1.0.0(@rushstack/n@2.0.0)
    const versionDelimiter: string = pnpmLockfileVersion < 60 ? '/' : '@';
    result.entryId =
      (pnpmLockfileVersion < 90 ? '/' : '') + result.name + versionDelimiter + result.versionPath;
  }

  if (result.dependencyKind === LfxDependencyKind.Peer) {
    result.peerDependencyMeta = {
      name: result.name,
      version: versionPath,
      optional: peerDependenciesMeta?.[result.name] ? peerDependenciesMeta[result.name].optional : false
    };
  }
  return new LfxGraphDependency(result);
}

function parsePackageDependencies(options: {
  dependencies: LfxGraphDependency[];
  lockfileEntry: LfxGraphEntry;
  /**
   * Used to obtain versionPath exact references.
   */
  mainEntry: lockfileTypes.LockfilePackageSnapshot;
  /**
   * Used to obtain informational version ranges.
   */
  specifierEntry: lockfileTypes.LockfilePackageInfo | undefined;
  pnpmLockfileVersion: PnpmLockfileVersion;
  workspace: IJsonLfxWorkspace;
}): void {
  const { dependencies, lockfileEntry, mainEntry, specifierEntry, pnpmLockfileVersion, workspace } = options;

  const node: Partial<lockfileTypes.ProjectSnapshot & lockfileTypes.PackageSnapshot> =
    mainEntry as unknown as Partial<lockfileTypes.ProjectSnapshot & lockfileTypes.PackageSnapshot>;

  function createDependency(kind: LfxDependencyKind, packageName: string, versionPath: string): void {
    let originalSpecifier: string | undefined = undefined;

    if (specifierEntry && specifierEntry.peerDependencies) {
      originalSpecifier = specifierEntry.peerDependencies[packageName];
      if (originalSpecifier) {
        kind = LfxDependencyKind.Peer;
      }
    }

    dependencies.push(
      createPackageLockfileDependency({
        kind,
        name: packageName,
        versionPath,
        originalSpecifier: originalSpecifier ?? '',
        containingEntry: lockfileEntry,
        peerDependenciesMeta: specifierEntry?.peerDependenciesMeta,
        pnpmLockfileVersion,
        workspace
      })
    );
  }

  if (node.dependencies) {
    for (const [packageName, versionPath] of Object.entries(node.dependencies)) {
      createDependency(LfxDependencyKind.Regular, packageName, versionPath);
    }
  }
  if (node.optionalDependencies) {
    for (const [packageName, versionPath] of Object.entries(node.optionalDependencies)) {
      createDependency(LfxDependencyKind.Regular, packageName, versionPath);
    }
  }
  if (node.devDependencies) {
    for (const [packageName, versionPath] of Object.entries(node.devDependencies)) {
      createDependency(LfxDependencyKind.Dev, packageName, versionPath);
    }
  }

  if (node.transitivePeerDependencies) {
    for (const dep of node.transitivePeerDependencies) {
      lockfileEntry.transitivePeerDependencies.add(dep);
    }
  }
}

function parseProjectDependencies54(options: {
  dependencies: LfxGraphDependency[];
  lockfileEntry: LfxGraphEntry;
  /**
   * Used to obtain versionPath exact references and informational version ranges
   */
  mainEntry: lockfileTypes.ProjectSnapshot;
  pnpmLockfileVersion: PnpmLockfileVersion;
  workspace: IJsonLfxWorkspace;
}): void {
  const { dependencies, lockfileEntry, mainEntry, pnpmLockfileVersion, workspace } = options;

  const node: Partial<lockfileTypes.ProjectSnapshot & lockfileTypes.PackageSnapshot> =
    mainEntry as unknown as Partial<lockfileTypes.ProjectSnapshot & lockfileTypes.PackageSnapshot>;

  function createDependency(kind: LfxDependencyKind, packageName: string, versionPath: string): void {
    let originalSpecifier: string | undefined = undefined;

    if (mainEntry.specifiers) {
      originalSpecifier = mainEntry.specifiers[packageName];
    }

    dependencies.push(
      createPackageLockfileDependency({
        kind,
        name: packageName,
        versionPath,
        originalSpecifier: originalSpecifier ?? '',
        containingEntry: lockfileEntry,
        pnpmLockfileVersion,
        workspace
      })
    );
  }

  if (node.dependencies) {
    for (const [packageName, versionPath] of Object.entries(node.dependencies)) {
      createDependency(LfxDependencyKind.Regular, packageName, versionPath);
    }
  }
  if (node.optionalDependencies) {
    for (const [packageName, versionPath] of Object.entries(node.optionalDependencies)) {
      createDependency(LfxDependencyKind.Regular, packageName, versionPath);
    }
  }
  if (node.devDependencies) {
    for (const [packageName, versionPath] of Object.entries(node.devDependencies)) {
      createDependency(LfxDependencyKind.Dev, packageName, versionPath);
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
  function createDependency(
    kind: LfxDependencyKind,
    packageName: string,
    specifierAndResolution: lockfileTypes.SpecifierAndResolution
  ): void {
    dependencies.push(
      createPackageLockfileDependency({
        kind,
        name: packageName,
        versionPath: specifierAndResolution.version,
        originalSpecifier: specifierAndResolution.specifier,
        containingEntry: lockfileEntry,
        pnpmLockfileVersion,
        workspace
      })
    );
  }

  if (snapshot.dependencies) {
    for (const [packageName, specifierAndResolution] of Object.entries(snapshot.dependencies)) {
      createDependency(LfxDependencyKind.Regular, packageName, specifierAndResolution);
    }
  }
  if (snapshot.optionalDependencies) {
    for (const [packageName, specifierAndResolution] of Object.entries(snapshot.optionalDependencies)) {
      createDependency(LfxDependencyKind.Regular, packageName, specifierAndResolution);
    }
  }
  if (snapshot.devDependencies) {
    for (const [packageName, specifierAndResolution] of Object.entries(snapshot.devDependencies)) {
      createDependency(LfxDependencyKind.Dev, packageName, specifierAndResolution);
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
  workspace: IJsonLfxWorkspace;
  pnpmLockfileVersion: PnpmLockfileVersion;
}): LfxGraphEntry {
  const { rawEntryId, pnpmLockfileVersion, workspace } = options;

  const result: ILfxGraphEntryOptions = {
    kind: LfxGraphEntryKind.Package,
    entryId: rawEntryId,
    rawEntryId: rawEntryId,
    packageJsonFolderPath: '',
    entryPackageName: '',
    displayText: rawEntryId,
    entryPackageVersion: '',
    entrySuffix: ''
  };

  // Example: pnpmLockfilePath   = 'common/temp/my-subspace/pnpm-lock.yaml'
  // Example: pnpmLockfileFolder = 'common/temp/my-subspace'
  const pnpmLockfileFolder: string = workspace.pnpmLockfileFolder;

  let slashlessRawEntryId: string;

  if (pnpmLockfileVersion >= 90) {
    // The leading slash is omitted starting in V9.0
    if (rawEntryId.startsWith('/')) {
      throw new Error('Not expecting leading "/" in path: ' + JSON.stringify(rawEntryId));
    }
    slashlessRawEntryId = rawEntryId;
  } else {
    if (!rawEntryId.startsWith('/')) {
      throw new Error('Expecting leading "/" in path: ' + JSON.stringify(rawEntryId));
    }
    slashlessRawEntryId = rawEntryId.substring(1);
  }

  let dotPnpmSubfolder: string;

  if (pnpmLockfileVersion < 60) {
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
    //       @rushstack/eslint-config@3.0.1
    //       @rushstack/l@1.0.0(@rushstack/m@1.0.0)(@rushstack/n@2.0.0)
    let versionAtSignIndex: number;
    if (slashlessRawEntryId.startsWith('@')) {
      versionAtSignIndex = slashlessRawEntryId.indexOf('@', 1);
    } else {
      versionAtSignIndex = slashlessRawEntryId.indexOf('@');
    }

    const packageName: string = slashlessRawEntryId.substring(0, versionAtSignIndex);
    result.entryPackageName = packageName;

    const leftParenIndex: number = slashlessRawEntryId.indexOf('(', versionAtSignIndex);
    if (leftParenIndex < 0) {
      const version: string = slashlessRawEntryId.substring(versionAtSignIndex + 1);
      result.entryPackageVersion = version;

      //       @rushstack/eslint-config@3.0.1
      // -->   @rushstack/eslint-config 3.0.1
      result.displayText = packageName + ' ' + version;
    } else {
      const version: string = slashlessRawEntryId.substring(versionAtSignIndex + 1, leftParenIndex);
      result.entryPackageVersion = version;

      // "(@rushstack/m@1.0.0)(@rushstack/n@2.0.0)"
      let suffix: string = slashlessRawEntryId.substring(leftParenIndex);

      // Rewrite to:
      // "@rushstack/m@1.0.0; @rushstack/n@2.0.0"
      suffix = Text.replaceAll(suffix, ')(', '; ');
      suffix = Text.replaceAll(suffix, '(', '');
      suffix = Text.replaceAll(suffix, ')', '');
      result.entrySuffix = suffix;

      //       @rushstack/l@1.0.0(@rushstack/m@1.0.0)(@rushstack/n@2.0.0)
      // -->   @rushstack/l 1.0.0 [@rushstack/m@1.0.0; @rushstack/n@2.0.0]
      result.displayText = packageName + ' ' + version + ' [' + suffix + ']';
    }

    // Example:  @rushstack/l@1.0.0(@rushstack/m@1.0.0)(@rushstack/n@2.0.0)
    // -->       @rushstack+l@1.0.0_@rushstack+m@1.0.0_@rushstack+n@2.0.0

    // @rushstack/l 1.0.0 (@rushstack/m@1.0.0)(@rushstack/n@2.0.0)
    dotPnpmSubfolder = Text.replaceAll(slashlessRawEntryId, '/', '+');
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
        continue;
      }

      const importer: LfxGraphEntry = createProjectLockfileEntry({
        rawEntryId: importerKey,
        duplicates,
        workspace,
        pnpmLockfileVersion
      });

      if (pnpmLockfileVersion < 60) {
        const lockfile54: lockfileTypes.LockfileObject = lockfileJson as lockfileTypes.LockfileObject;
        const importerValue: lockfileTypes.ProjectSnapshot =
          lockfile54.importers[importerKey as pnpmTypes.ProjectId];

        parseProjectDependencies54({
          dependencies: importer.dependencies,
          lockfileEntry: importer,
          mainEntry: importerValue,
          pnpmLockfileVersion,
          workspace
        });
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

  if (pnpmLockfileVersion < 90) {
    if (lockfile.packages) {
      for (const [dependencyKey, dependencyValue] of Object.entries(lockfile.packages)) {
        const lockfileEntry: LfxGraphEntry = createPackageLockfileEntry({
          rawEntryId: dependencyKey,
          workspace,
          pnpmLockfileVersion
        });
        parsePackageDependencies({
          dependencies: lockfileEntry.dependencies,
          lockfileEntry: lockfileEntry,
          mainEntry: dependencyValue,
          specifierEntry: dependencyValue,
          pnpmLockfileVersion,
          workspace
        });
        allEntries.push(lockfileEntry);
        allEntriesById.set(dependencyKey, lockfileEntry);
      }
    }
  } else {
    const packagesByKey: Map<string, lockfileTypes.LockfilePackageInfo> = new Map();
    if (lockfile.packages) {
      for (const [dependencyKey, dependencyValue] of Object.entries(lockfile.packages)) {
        packagesByKey.set(dependencyKey, dependencyValue);
      }
    }

    // In v9.0 format, the dependency graph for non-workspace packages is found under "snapshots" not "packages".
    // (The "packages" section now stores other fields that are unrelated to the graph itself.)
    const lockfile90: lockfileTypes.LockfileFile = lockfileJson as lockfileTypes.LockfileFile;
    if (lockfile90.snapshots) {
      for (const [dependencyKey, dependencyValue] of Object.entries(lockfile90.snapshots)) {
        const lockfileEntry: LfxGraphEntry = createPackageLockfileEntry({
          rawEntryId: dependencyKey,
          workspace,
          pnpmLockfileVersion
        });

        // Example: "@scope/my-package@1.0.0"
        const packageInfoKey: string =
          lockfileEntry.entryPackageName + '@' + lockfileEntry.entryPackageVersion;
        const packageInfo: lockfileTypes.LockfilePackageInfo | undefined = packagesByKey.get(packageInfoKey);

        parsePackageDependencies({
          dependencies: lockfileEntry.dependencies,
          lockfileEntry,
          mainEntry: dependencyValue,
          specifierEntry: packageInfo,
          pnpmLockfileVersion,
          workspace
        });

        allEntries.push(lockfileEntry);
        allEntriesById.set(lockfileEntry.entryId, lockfileEntry);
      }
    }
  }

  // Construct the graph
  for (const entry of allEntries) {
    for (const dependency of entry.dependencies) {
      // Peer dependencies do not have a matching entry
      if (dependency.dependencyKind === LfxDependencyKind.Peer) {
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
