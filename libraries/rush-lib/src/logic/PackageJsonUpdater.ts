// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import type { INpmCheckPackageSummary } from '@rushstack/npm-check-fork';
import { Colorize, type ITerminal } from '@rushstack/terminal';
import { Async } from '@rushstack/node-core-library';

import type { RushConfiguration } from '../api/RushConfiguration';
import type { BaseInstallManager } from './base/BaseInstallManager';
import type { IInstallManagerOptions } from './base/BaseInstallManagerTypes';
import { InstallManagerFactory } from './InstallManagerFactory';
import { VersionMismatchFinder } from './versionMismatch/VersionMismatchFinder';
import { PurgeManager } from './PurgeManager';
import { Utilities } from '../utilities/Utilities';
import { DependencyType, type PackageJsonDependency } from '../api/PackageJsonEditor';
import type { RushGlobalFolder } from '../api/RushGlobalFolder';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { VersionMismatchFinderEntity } from './versionMismatch/VersionMismatchFinderEntity';
import { VersionMismatchFinderProject } from './versionMismatch/VersionMismatchFinderProject';
import { RushConstants } from './RushConstants';
import { InstallHelpers } from './installManager/InstallHelpers';
import type { DependencyAnalyzer, IDependencyAnalysis } from './DependencyAnalyzer';
import {
  type IPackageForRushAdd,
  type IPackageJsonUpdaterRushAddOptions,
  type IPackageJsonUpdaterRushBaseUpdateOptions,
  type IPackageJsonUpdaterRushRemoveOptions,
  SemVerStyle
} from './PackageJsonUpdaterTypes';
import type { Subspace } from '../api/Subspace';
import { MAKE_CONSISTENT_FLAG_NAME } from '../cli/actions/AddAction';
import {
  DEFAULT_PNPM_CATALOG_NAME,
  formatPnpmCatalogSpecifier,
  type IPnpmCatalogReference,
  PNPM_CATALOG_PROTOCOL,
  tryGetPnpmCatalogVersion,
  tryParsePnpmCatalogName,
  tryResolvePnpmCatalogReference
} from './pnpm/PnpmCatalogReference';
import type { PnpmCatalogs } from './pnpm/EffectivePnpmOptions';
import { PendingPnpmCatalogUpdates } from './pnpm/PendingPnpmCatalogUpdates';

/**
 * Options for adding a dependency to a particular project.
 */
export interface IPackageJsonUpdaterRushUpgradeOptions {
  /**
   * The projects whose package.jsons should get updated
   */
  projects: RushConfigurationProject[];
  /**
   * The dependencies to be added.
   */
  packagesToAdd: INpmCheckPackageSummary[];
  /**
   * If specified, other packages that use this dependency will also have their package.json's updated.
   */
  updateOtherPackages: boolean;
  /**
   * If specified, "rush update" will not be run after updating the package.json file(s).
   */
  skipUpdate: boolean;
  /**
   * If specified, "rush update" will be run in debug mode.
   */
  debugInstall: boolean;
  /**
   * The variant to consider when performing installations and validating shrinkwrap updates.
   */
  variant: string | undefined;
}

/**
 * Configuration options for adding or updating a dependency in single project
 * or removing a dependency from a particular project
 */
export interface IBaseUpdateProjectOptions {
  /**
   * The project which will have its package.json updated
   */
  project: VersionMismatchFinderEntity;
  /**
   * Map of packages to update
   * Its key is the name of the dependency to be added or updated in the project
   * Its value is the new SemVer specifier that should be added to the project's package.json
   * If trying to remove this packages, value can be empty string
   */
  dependenciesToAddOrUpdateOrRemove: Record<string, string>;
}

/**
 * Configuration options for adding or updating a dependency in a single project
 */
export interface IUpdateProjectOptions extends IBaseUpdateProjectOptions {
  /**
   * The type of dependency that should be updated. If left empty, this will be auto-detected.
   * If it cannot be auto-detected an exception will be thrown.
   */
  dependencyType?: DependencyType;
}
/**
 * Configuration options for removing dependencies from a single project
 */
export interface IRemoveProjectOptions extends IBaseUpdateProjectOptions {}

/**
 * The version of a package that "rush add" selected.
 */
interface IRushAddSelectedVersion {
  /**
   * The version specifier that the package resolves to. This is never a PNPM catalog reference.
   */
  version: string;
  /**
   * The version specifier to write to package.json, which is either `version` or a PNPM catalog reference.
   */
  versionSpecifier: string;
  /**
   * The name of the PNPM catalog that `versionSpecifier` references, if any.
   */
  catalogName: string | undefined;
  /**
   * True if the catalog reference was specified explicitly, such as `rush add --package example@catalog:`.
   */
  isExplicitCatalogReference: boolean;
}

/**
 * The changes that "rush upgrade-interactive" makes to the package.json file of a project.
 */
interface IUpgradeProjectUpdates {
  project: VersionMismatchFinderEntity;
  dependenciesToUpdate: Record<string, string>;
  devDependenciesToUpdate: Record<string, string>;
}

/**
 * A helper class for managing the dependencies of various package.json files.
 * @internal
 */
export class PackageJsonUpdater {
  readonly #terminal: ITerminal;
  readonly #rushConfiguration: RushConfiguration;
  readonly #rushGlobalFolder: RushGlobalFolder;
  /**
   * Catalog references that were already reported as not updated, to avoid repeating the warning.
   */
  readonly #reportedCatalogReferences: Set<string>;

  public constructor(
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    rushGlobalFolder: RushGlobalFolder
  ) {
    this.#terminal = terminal;
    this.#rushConfiguration = rushConfiguration;
    this.#rushGlobalFolder = rushGlobalFolder;
    this.#reportedCatalogReferences = new Set();
  }

  /**
   * Upgrade dependencies to a particular project, or across specified projects. This is the core business logic for
   * "rush upgrade-interactive".
   *
   * @remarks
   * If a project references a dependency through a PNPM catalog (such as `catalog:`), the catalog entry is
   * updated instead, and the project keeps its catalog reference. This matches `pnpm update`.
   */
  public async doRushUpgradeAsync(options: IPackageJsonUpdaterRushUpgradeOptions): Promise<void> {
    const { projects, packagesToAdd, updateOtherPackages, skipUpdate, debugInstall, variant } = options;
    const { DependencyAnalyzer } = await import(
      /* webpackChunkName: 'DependencyAnalyzer' */
      './DependencyAnalyzer'
    );
    const dependencyAnalyzer: DependencyAnalyzer = DependencyAnalyzer.forRushConfiguration(
      this.#rushConfiguration
    );
    const {
      allVersionsByPackageName,
      implicitlyPreferredVersionByPackageName,
      commonVersionsConfiguration
    }: IDependencyAnalysis = dependencyAnalyzer.getAnalysis(undefined, variant, false);

    const pendingCatalogUpdates: PendingPnpmCatalogUpdates = new PendingPnpmCatalogUpdates(
      this.#rushConfiguration
    );

    const projectUpdatesByProject: Map<RushConfigurationProject, IUpgradeProjectUpdates> = new Map();
    for (const project of projects) {
      projectUpdatesByProject.set(project, {
        project: new VersionMismatchFinderProject(project),
        dependenciesToUpdate: {},
        devDependenciesToUpdate: {}
      });
    }

    // The new version of each package. This is never a catalog reference.
    const versionByPackageName: Map<string, string> = new Map();

    for (const { moduleName, latest: latestVersion, packageJson, devDependency } of packagesToAdd) {
      const dependencyType: DependencyType = devDependency ? DependencyType.Dev : DependencyType.Regular;

      // The projects that reference the package through a PNPM catalog get the catalog entry updated instead
      const catalogReferenceByProject: Map<RushConfigurationProject, IPnpmCatalogReference> = new Map();
      for (const [project, { project: mismatchFinderProject }] of projectUpdatesByProject) {
        const catalogReference: IPnpmCatalogReference | undefined = this.#tryGetResolvedCatalogReference(
          mismatchFinderProject,
          moduleName,
          dependencyType,
          pendingCatalogUpdates.getCatalogs(project.subspace)
        );
        if (catalogReference) {
          catalogReferenceByProject.set(project, catalogReference);
        }
      }

      // Keep the range style of the catalog entry
      const catalogVersions: string[] = Array.from(
        catalogReferenceByProject.values(),
        ({ resolvedVersion }) => resolvedVersion!
      );
      const inferredRangeStyle: SemVerStyle = this.#cheaplyDetectSemVerRangeStyle(
        catalogVersions[0] ?? packageJson
      );
      const implicitlyPreferredVersion: string | undefined =
        implicitlyPreferredVersionByPackageName.get(moduleName);

      const explicitlyPreferredVersion: string | undefined =
        commonVersionsConfiguration.preferredVersions.get(moduleName);

      const version: string = await this.#getNormalizedVersionSpecAsync(
        projects,
        moduleName,
        latestVersion,
        implicitlyPreferredVersion,
        explicitlyPreferredVersion,
        inferredRangeStyle,
        commonVersionsConfiguration.ensureConsistentVersions
      );

      versionByPackageName.set(moduleName, version);

      this.#terminal.writeLine(
        Colorize.green(`Updating projects to use `) + moduleName + '@' + Colorize.cyan(version)
      );
      this.#terminal.writeLine();

      for (const [project, projectUpdates] of projectUpdatesByProject) {
        const catalogReference: IPnpmCatalogReference | undefined = catalogReferenceByProject.get(project);
        if (catalogReference) {
          pendingCatalogUpdates.setVersion(
            project.subspace,
            catalogReference.catalogName,
            moduleName,
            version
          );
          this.#terminal.writeLine(
            `"${project.packageName}" references "${moduleName}" through the PNPM catalog ` +
              `"${formatPnpmCatalogSpecifier(catalogReference.catalogName)}", so the catalog entry will be ` +
              'updated instead of package.json.'
          );
        } else if (devDependency) {
          projectUpdates.devDependenciesToUpdate[moduleName] = version;
        } else {
          projectUpdates.dependenciesToUpdate[moduleName] = version;
        }
      }

      if (commonVersionsConfiguration.ensureConsistentVersions && !updateOtherPackages) {
        if (catalogReferenceByProject.size > 0) {
          // Updating a catalog entry also changes the version for every other project that references the
          // entry, so check the versions that the projects will use after the change.
          const allowedAlternativeVersions: ReadonlySet<string> = new Set(
            commonVersionsConfiguration.allowedAlternativeVersions.get(moduleName)
          );
          const otherVersions: string[] = Array.from(
            this.#getVersionsAfterUpgrade(
              moduleName,
              version,
              dependencyType,
              projectUpdatesByProject,
              pendingCatalogUpdates
            )
          ).filter(
            (otherVersion: string) =>
              otherVersion !== version && !allowedAlternativeVersions.has(otherVersion)
          );
          if (otherVersions.length > 0) {
            this.#throwMismatchedVersionsError(moduleName, version, otherVersions);
          }
        } else {
          const existingSpecifiedVersions: Set<string> | undefined = allVersionsByPackageName.get(moduleName);
          if (existingSpecifiedVersions && !existingSpecifiedVersions.has(version)) {
            // There are existing versions, and the version we're going to use is not one of them, and this repo
            // requires consistent versions, and we aren't going to update other packages, so we can't proceed.
            this.#throwMismatchedVersionsError(moduleName, version, existingSpecifiedVersions);
          }
        }
      }
    }

    const allPackageUpdates: Map<string, VersionMismatchFinderEntity> = new Map();

    for (const {
      project,
      dependenciesToUpdate,
      devDependenciesToUpdate
    } of projectUpdatesByProject.values()) {
      allPackageUpdates.set(project.filePath, project);

      this.updateProject({
        project,
        dependenciesToAddOrUpdateOrRemove: dependenciesToUpdate,
        dependencyType: DependencyType.Regular
      });
      this.updateProject({
        project,
        dependenciesToAddOrUpdateOrRemove: devDependenciesToUpdate,
        dependencyType: DependencyType.Dev
      });
    }

    if (updateOtherPackages) {
      for (const subspace of this.#rushConfiguration.getSubspacesForProjects(projects)) {
        const mismatchFinder: VersionMismatchFinder = VersionMismatchFinder.getMismatches(
          this.#rushConfiguration,
          {
            subspace,
            variant,
            pnpmCatalogs: pendingCatalogUpdates.getCatalogs(subspace)
          }
        );
        for (const update of this.#getUpdates(
          mismatchFinder,
          versionByPackageName,
          subspace,
          pendingCatalogUpdates
        )) {
          this.updateProject(update);
          allPackageUpdates.set(update.project.filePath, update.project);
        }
      }
    }

    await Async.forEachAsync(
      allPackageUpdates,
      async ([filePath, project]) => {
        const modified: boolean = await project.saveIfModifiedAsync();
        if (modified) {
          this.#terminal.writeLine(Colorize.green('Wrote ') + filePath);
        }
      },
      { concurrency: 10 }
    );

    const subspacesToUpdate: ReadonlySet<Subspace> = skipUpdate
      ? new Set()
      : this.#getSubspacesToUpdate(projects);
    await pendingCatalogUpdates.saveAsync(this.#terminal, subspacesToUpdate);

    for (const subspace of subspacesToUpdate) {
      await this.#doUpdateAsync(debugInstall, subspace, variant);
    }
  }

  public async doRushUpdateAsync(options: IPackageJsonUpdaterRushBaseUpdateOptions): Promise<void> {
    const pendingCatalogUpdates: PendingPnpmCatalogUpdates = new PendingPnpmCatalogUpdates(
      this.#rushConfiguration
    );

    let allPackageUpdates: IUpdateProjectOptions[] = [];
    if (options.actionName === 'add') {
      allPackageUpdates = await this.#doRushAddAsync(
        options as IPackageJsonUpdaterRushAddOptions,
        pendingCatalogUpdates
      );
    } else if (options.actionName === 'remove') {
      allPackageUpdates = await this.#doRushRemoveAsync(options as IPackageJsonUpdaterRushRemoveOptions);
    } else {
      throw new Error('only accept "rush add" or "rush remove"');
    }

    const { skipUpdate, debugInstall, variant } = options;
    await Async.forEachAsync(
      allPackageUpdates,
      async ({ project }) => {
        const modified: boolean = await project.saveIfModifiedAsync();
        if (modified) {
          this.#terminal.writeLine(Colorize.green('Wrote'), project.filePath);
        }
      },
      { concurrency: 10 }
    );

    const subspacesToUpdate: ReadonlySet<Subspace> = skipUpdate
      ? new Set()
      : this.#getSubspacesToUpdate(options.projects);
    await pendingCatalogUpdates.saveAsync(this.#terminal, subspacesToUpdate);

    for (const subspace of subspacesToUpdate) {
      await this.#doUpdateAsync(debugInstall, subspace, variant);
    }
  }

  /**
   * Returns the subspaces that "rush update" runs for after the package.json files of the projects are changed.
   */
  #getSubspacesToUpdate(projects: Iterable<RushConfigurationProject>): ReadonlySet<Subspace> {
    if (this.#rushConfiguration.subspacesFeatureEnabled) {
      return this.#rushConfiguration.getSubspacesForProjects(projects);
    } else {
      return new Set([this.#rushConfiguration.defaultSubspace]);
    }
  }

  async #doUpdateAsync(
    debugInstall: boolean,
    subspace: Subspace,
    variant: string | undefined
  ): Promise<void> {
    this.#terminal.writeLine();
    this.#terminal.writeLine(Colorize.green('Running "rush update"'));
    this.#terminal.writeLine();

    const purgeManager: PurgeManager = new PurgeManager(this.#rushConfiguration, this.#rushGlobalFolder);
    const installManagerOptions: IInstallManagerOptions = {
      debug: debugInstall,
      allowShrinkwrapUpdates: true,
      bypassPolicy: false,
      noLink: false,
      fullUpgrade: false,
      recheckShrinkwrap: false,
      networkConcurrency: undefined,
      offline: false,
      collectLogFile: false,
      variant,
      maxInstallAttempts: RushConstants.defaultMaxInstallAttempts,
      pnpmFilterArgumentValues: [],
      selectedProjects: new Set(this.#rushConfiguration.projects),
      checkOnly: false,
      subspace: subspace,
      terminal: this.#terminal
    };

    const installManager: BaseInstallManager = await InstallManagerFactory.getInstallManagerAsync(
      this.#rushConfiguration,
      this.#rushGlobalFolder,
      purgeManager,
      installManagerOptions
    );
    try {
      await installManager.doInstallAsync();
    } finally {
      await purgeManager.startDeleteAllAsync();
    }
  }

  /**
   * Adds a dependency to a particular project. The core business logic for "rush add".
   */
  async #doRushAddAsync(
    options: IPackageJsonUpdaterRushAddOptions,
    pendingCatalogUpdates: PendingPnpmCatalogUpdates
  ): Promise<IUpdateProjectOptions[]> {
    const { projects } = options;

    const { DependencyAnalyzer } = await import(
      /* webpackChunkName: 'DependencyAnalyzer' */
      './DependencyAnalyzer'
    );
    const dependencyAnalyzer: DependencyAnalyzer = DependencyAnalyzer.forRushConfiguration(
      this.#rushConfiguration
    );

    const allPackageUpdates: IUpdateProjectOptions[] = [];
    const subspaceSet: ReadonlySet<Subspace> = this.#rushConfiguration.getSubspacesForProjects(projects);
    for (const subspace of subspaceSet) {
      // Projects for this subspace
      allPackageUpdates.push(
        ...(await this.#updateProjectsAsync(subspace, dependencyAnalyzer, options, pendingCatalogUpdates))
      );
    }

    return allPackageUpdates;
  }

  async #updateProjectsAsync(
    subspace: Subspace,
    dependencyAnalyzer: DependencyAnalyzer,
    options: IPackageJsonUpdaterRushAddOptions,
    pendingCatalogUpdates: PendingPnpmCatalogUpdates
  ): Promise<IUpdateProjectOptions[]> {
    const { projects, packagesToUpdate, devDependency, peerDependency, updateOtherPackages, variant } =
      options;

    // Get projects for this subspace
    const subspaceProjects: RushConfigurationProject[] = projects.filter(
      (project) => project.subspace === subspace
    );

    const analysis: IDependencyAnalysis = dependencyAnalyzer.getAnalysis(
      subspace,
      variant,
      options.actionName === 'add'
    );
    const { allVersionsByPackageName, commonVersionsConfiguration } = analysis;

    const dependencyType: DependencyType | undefined = devDependency
      ? DependencyType.Dev
      : peerDependency
        ? DependencyType.Peer
        : undefined;

    // Each project gets its own record, because a project that references a package through a PNPM catalog
    // keeps its catalog reference.
    const projectUpdates: IUpdateProjectOptions[] = subspaceProjects.map((project) => ({
      project: new VersionMismatchFinderProject(project),
      dependenciesToAddOrUpdateOrRemove: {},
      dependencyType
    }));

    // The version that each package resolves to. This is never a catalog reference.
    const versionByPackageName: Map<string, string> = new Map();

    this.#terminal.writeLine();
    for (const packageToUpdate of packagesToUpdate) {
      const { packageName } = packageToUpdate;
      const selectedVersion: IRushAddSelectedVersion = await this.#getRushAddVersionAsync(
        subspace,
        subspaceProjects,
        projectUpdates,
        packageToUpdate,
        analysis,
        updateOtherPackages,
        pendingCatalogUpdates
      );
      const { version, versionSpecifier } = selectedVersion;

      versionByPackageName.set(packageName, version);
      this.#terminal.writeLine(
        Colorize.green('Updating projects to use '),
        `${packageName}@`,
        Colorize.cyan(versionSpecifier === version ? version : `${versionSpecifier} (${version})`)
      );
      this.#terminal.writeLine();

      for (const projectUpdate of projectUpdates) {
        projectUpdate.dependenciesToAddOrUpdateOrRemove[packageName] = this.#getRushAddVersionSpecifier(
          projectUpdate,
          packageName,
          selectedVersion,
          subspace,
          updateOtherPackages,
          pendingCatalogUpdates
        );
      }

      const existingSpecifiedVersions: Set<string> | undefined = allVersionsByPackageName.get(packageName);
      if (
        existingSpecifiedVersions &&
        !existingSpecifiedVersions.has(version) &&
        commonVersionsConfiguration.ensureConsistentVersions &&
        !updateOtherPackages
      ) {
        // There are existing versions, and the version we're going to use is not one of them, and this repo
        // requires consistent versions, and we aren't going to update other packages, so we can't proceed.
        this.#throwMismatchedVersionsError(packageName, version, existingSpecifiedVersions);
      }
    }

    this.updateProjects(projectUpdates);

    // we need to do a mismatch check
    let otherPackageUpdates: IUpdateProjectOptions[] = [];
    if (updateOtherPackages) {
      const mismatchFinder: VersionMismatchFinder = VersionMismatchFinder.getMismatches(
        this.#rushConfiguration,
        {
          subspace,
          variant,
          pnpmCatalogs: pendingCatalogUpdates.getCatalogs(subspace)
        }
      );
      otherPackageUpdates = this.#getUpdates(
        mismatchFinder,
        versionByPackageName,
        subspace,
        pendingCatalogUpdates
      );
      this.updateProjects(otherPackageUpdates);
    }

    return [...projectUpdates, ...otherPackageUpdates];
  }

  /**
   * Selects the version of a package that "rush add" adds to the projects of a subspace.
   *
   * @remarks
   * If the PNPM catalogs of the subspace have an entry for the package, a catalog reference is selected when
   * the catalog entry matches the requested version (or when no version was requested), like PNPM's
   * `catalogMode: prefer` setting. If the "--make-consistent" flag was specified, the catalog entry is
   * updated to the requested version.
   */
  async #getRushAddVersionAsync(
    subspace: Subspace,
    subspaceProjects: RushConfigurationProject[],
    projectUpdates: IUpdateProjectOptions[],
    { packageName, version: initialVersion, rangeStyle }: IPackageForRushAdd,
    {
      implicitlyPreferredVersionByPackageName,
      commonVersionsConfiguration,
      catalogNamesByPackageName
    }: IDependencyAnalysis,
    updateOtherPackages: boolean,
    pendingCatalogUpdates: PendingPnpmCatalogUpdates
  ): Promise<IRushAddSelectedVersion> {
    const catalogs: PnpmCatalogs | undefined = pendingCatalogUpdates.getCatalogs(subspace);
    const getCatalogVersion: (catalogName: string) => string | undefined = (catalogName: string) =>
      tryGetPnpmCatalogVersion(catalogs, catalogName, packageName);

    const explicitCatalogName: string | undefined =
      initialVersion === undefined ? undefined : tryParsePnpmCatalogName(initialVersion);
    if (explicitCatalogName !== undefined) {
      const versionSpecifier: string = formatPnpmCatalogSpecifier(explicitCatalogName);
      const version: string = this.#getExplicitCatalogVersion(
        subspace,
        catalogs,
        explicitCatalogName,
        packageName,
        initialVersion!,
        pendingCatalogUpdates
      );
      this.#terminal.writeLine(
        Colorize.green('Assigning "') +
          Colorize.cyan(versionSpecifier) +
          Colorize.green(`" for "${packageName}", which is "${version}" in the PNPM catalog.`)
      );
      return {
        version,
        versionSpecifier,
        catalogName: explicitCatalogName,
        isExplicitCatalogReference: true
      };
    }

    const candidateCatalogNames: string[] = this.#getCatalogNamesWithPackage(
      catalogs,
      packageName,
      subspaceProjects
    );
    // Prefer the catalogs that the projects already reference the package through, then the catalogs that
    // other projects reference it through
    const preferredCatalogNames: Iterable<string>[] = [
      this.#getReferencedCatalogNames(projectUpdates, packageName),
      catalogNamesByPackageName.get(packageName) ?? []
    ];

    if (candidateCatalogNames.length > 0) {
      const matchingCatalogNames: string[] =
        initialVersion === undefined
          ? candidateCatalogNames
          : candidateCatalogNames.filter((catalogName) => getCatalogVersion(catalogName) === initialVersion);
      const catalogName: string | undefined = this.#trySelectCatalogName(
        matchingCatalogNames,
        preferredCatalogNames
      );
      if (catalogName !== undefined) {
        return this.#getCatalogSelectedVersion(packageName, catalogName, getCatalogVersion(catalogName)!);
      }
    }

    const implicitlyPreferredVersion: string | undefined =
      implicitlyPreferredVersionByPackageName.get(packageName);
    const explicitlyPreferredVersion: string | undefined =
      commonVersionsConfiguration.preferredVersions.get(packageName);

    const version: string = await this.#getNormalizedVersionSpecAsync(
      subspaceProjects,
      packageName,
      initialVersion,
      implicitlyPreferredVersion,
      explicitlyPreferredVersion,
      rangeStyle,
      commonVersionsConfiguration.ensureConsistentVersions
    );

    const literalVersion: IRushAddSelectedVersion = {
      version,
      versionSpecifier: version,
      catalogName: undefined,
      isExplicitCatalogReference: false
    };
    if (candidateCatalogNames.length === 0) {
      return literalVersion;
    }

    const catalogNamesWithVersion: string[] = candidateCatalogNames.filter(
      (catalogName) => getCatalogVersion(catalogName) === version
    );
    const catalogName: string | undefined = this.#trySelectCatalogName(
      catalogNamesWithVersion,
      preferredCatalogNames
    );
    if (catalogName !== undefined) {
      return this.#getCatalogSelectedVersion(packageName, catalogName, version);
    }

    const canUpdateCatalog: boolean =
      catalogNamesWithVersion.length === 0 && initialVersion !== undefined && updateOtherPackages;
    if (canUpdateCatalog) {
      const catalogNameToUpdate: string | undefined = this.#trySelectCatalogName(
        candidateCatalogNames,
        preferredCatalogNames
      );
      if (catalogNameToUpdate !== undefined) {
        pendingCatalogUpdates.setVersion(subspace, catalogNameToUpdate, packageName, version);
        this.#terminal.writeLine(
          `Updating "${packageName}" in the PNPM catalog "${formatPnpmCatalogSpecifier(catalogNameToUpdate)}" ` +
            `to "${version}" because the "${MAKE_CONSISTENT_FLAG_NAME}" flag was specified.`
        );
        return this.#getCatalogSelectedVersion(packageName, catalogNameToUpdate, version);
      }
    }

    const catalogList: string = candidateCatalogNames
      .map((name) => `"${formatPnpmCatalogSpecifier(name)}" (${getCatalogVersion(name)})`)
      .join(', ');
    const isVersionMismatch: boolean = catalogNamesWithVersion.length === 0 && initialVersion !== undefined;
    const reason: string = isVersionMismatch
      ? `"${version}" for "${packageName}" is different from the PNPM ` +
        (candidateCatalogNames.length === 1
          ? `catalog entry ${catalogList}`
          : `catalog entries ${catalogList}`)
      : `Rush could not choose between the PNPM catalogs ${catalogList} for "${packageName}"`;
    const catalogSpecifierExample: string =
      candidateCatalogNames.length === 1
        ? formatPnpmCatalogSpecifier(candidateCatalogNames[0])
        : `${PNPM_CATALOG_PROTOCOL}<name>`;
    this.#terminal.writeLine(
      Colorize.yellow(
        `Note: ${reason}, so the version "${version}" is assigned instead of a catalog reference. ` +
          `To reference a catalog, specify "${packageName}@${catalogSpecifierExample}"` +
          (isVersionMismatch && !updateOtherPackages
            ? `, or use the "${MAKE_CONSISTENT_FLAG_NAME}" flag to update the catalog entry.`
            : '.')
      )
    );
    return literalVersion;
  }

  #getCatalogSelectedVersion(
    packageName: string,
    catalogName: string,
    version: string
  ): IRushAddSelectedVersion {
    const versionSpecifier: string = formatPnpmCatalogSpecifier(catalogName);
    this.#terminal.writeLine(
      Colorize.green('Assigning "') +
        Colorize.cyan(versionSpecifier) +
        Colorize.green(`" for "${packageName}" because it is "${version}" in the PNPM catalog.`)
    );
    return { version, versionSpecifier, catalogName, isExplicitCatalogReference: false };
  }

  /**
   * Returns the version from the catalog entry that an explicitly specified catalog reference refers to,
   * such as `rush add --package example@catalog:tools`.
   */
  #getExplicitCatalogVersion(
    subspace: Subspace,
    catalogs: PnpmCatalogs | undefined,
    catalogName: string,
    packageName: string,
    versionSpecifier: string,
    pendingCatalogUpdates: PendingPnpmCatalogUpdates
  ): string {
    if (!this.#rushConfiguration.isPnpm) {
      throw new Error(
        `The version specifier "${versionSpecifier}" for "${packageName}" references a PNPM catalog, ` +
          'but catalogs are only supported when the package manager is PNPM.'
      );
    }

    const version: string | undefined = tryGetPnpmCatalogVersion(catalogs, catalogName, packageName);
    if (version !== undefined) {
      return version;
    }

    const pnpmConfigFilePath: string = pendingCatalogUpdates.getPnpmConfigFilePath(subspace);
    if (!catalogs || !Object.prototype.hasOwnProperty.call(catalogs, catalogName)) {
      throw new Error(
        `The PNPM catalog "${catalogName}" that "${packageName}@${versionSpecifier}" references is not ` +
          `defined in the "globalCatalogs" setting of ${pnpmConfigFilePath}.`
      );
    }

    throw new Error(
      `The PNPM catalog "${catalogName}" in ${pnpmConfigFilePath} does not have an entry for ` +
        `"${packageName}". Add "${packageName}" to the catalog, or specify a version instead of ` +
        `"${versionSpecifier}".`
    );
  }

  /**
   * Returns the names of the catalogs that have an entry for the package. Rush only references a catalog
   * implicitly for packages that are not local projects linked with the "workspace:" protocol.
   */
  #getCatalogNamesWithPackage(
    catalogs: PnpmCatalogs | undefined,
    packageName: string,
    projects: RushConfigurationProject[]
  ): string[] {
    if (!catalogs) {
      return [];
    }

    if (
      this.#rushConfiguration.projectsByName.has(packageName) &&
      projects.some((project) => !project.decoupledLocalDependencies.has(packageName))
    ) {
      return [];
    }

    return Object.keys(catalogs).filter(
      (catalogName) => tryGetPnpmCatalogVersion(catalogs, catalogName, packageName) !== undefined
    );
  }

  /**
   * Returns the names of the catalogs that the projects reference the package through.
   */
  #getReferencedCatalogNames(projectUpdates: IUpdateProjectOptions[], packageName: string): Set<string> {
    const result: Set<string> = new Set();
    for (const { project, dependencyType } of projectUpdates) {
      const versionSpecifier: string | undefined = this.#tryGetExistingDependency(
        project,
        packageName,
        dependencyType
      )?.version;
      const catalogName: string | undefined =
        versionSpecifier === undefined ? undefined : tryParsePnpmCatalogName(versionSpecifier);
      if (catalogName !== undefined) {
        result.add(catalogName);
      }
    }

    return result;
  }

  /**
   * Chooses one of the catalogs. Catalogs from the first of the `preferredCatalogNames` sets that includes any
   * of them are considered first. Among those, a single catalog or else the default catalog is chosen.
   * Returns `undefined` if the choice is ambiguous.
   */
  #trySelectCatalogName(
    catalogNames: string[],
    preferredCatalogNames: Iterable<string>[]
  ): string | undefined {
    const selectFrom: (names: string[]) => string | undefined = (names: string[]) => {
      if (names.length === 1) {
        return names[0];
      }

      return names.includes(DEFAULT_PNPM_CATALOG_NAME) ? DEFAULT_PNPM_CATALOG_NAME : undefined;
    };

    if (catalogNames.length <= 1) {
      return catalogNames[0];
    }

    for (const preferredNames of preferredCatalogNames) {
      const preferredNameSet: ReadonlySet<string> = new Set(preferredNames);
      const preferredCatalogNamesToSelectFrom: string[] = catalogNames.filter((name) =>
        preferredNameSet.has(name)
      );
      if (preferredCatalogNamesToSelectFrom.length > 0) {
        return selectFrom(preferredCatalogNamesToSelectFrom);
      }
    }

    return selectFrom(catalogNames);
  }

  /**
   * Returns the version specifier that "rush add" writes for the package in a project.
   *
   * @remarks
   * If the project already references the package through a PNPM catalog, the reference is kept, because
   * replacing it would silently detach the project from the catalog. If the catalog entry has a different
   * version, it is updated when the "--make-consistent" flag was specified; otherwise this throws.
   */
  #getRushAddVersionSpecifier(
    { project, dependencyType }: IUpdateProjectOptions,
    packageName: string,
    { version, versionSpecifier, isExplicitCatalogReference }: IRushAddSelectedVersion,
    subspace: Subspace,
    updateOtherPackages: boolean,
    pendingCatalogUpdates: PendingPnpmCatalogUpdates
  ): string {
    if (isExplicitCatalogReference) {
      return versionSpecifier;
    }

    const existingVersionSpecifier: string | undefined = this.#tryGetExistingDependency(
      project,
      packageName,
      dependencyType
    )?.version;
    if (existingVersionSpecifier === undefined) {
      return versionSpecifier;
    }

    const catalogReference: IPnpmCatalogReference | undefined = tryResolvePnpmCatalogReference(
      packageName,
      existingVersionSpecifier,
      pendingCatalogUpdates.getCatalogs(subspace)
    );
    if (!catalogReference) {
      return versionSpecifier;
    }

    if (catalogReference.resolvedVersion === undefined) {
      this.#terminal.writeWarningLine(
        `"${project.friendlyName}" references "${packageName}" through "${existingVersionSpecifier}", but ` +
          `that PNPM catalog does not have an entry for it. Replacing the reference with "${versionSpecifier}".`
      );
      return versionSpecifier;
    }

    if (catalogReference.resolvedVersion === version) {
      return existingVersionSpecifier;
    }

    const pnpmConfigFilePath: string = pendingCatalogUpdates.getPnpmConfigFilePath(subspace);
    if (updateOtherPackages) {
      pendingCatalogUpdates.setVersion(subspace, catalogReference.catalogName, packageName, version);
      this.#terminal.writeLine(
        `Updating "${packageName}" in the PNPM catalog ` +
          `"${formatPnpmCatalogSpecifier(catalogReference.catalogName)}" to "${version}" because ` +
          `"${project.friendlyName}" references it.`
      );
      return existingVersionSpecifier;
    }

    throw new Error(
      `"${project.friendlyName}" references "${packageName}" through the PNPM catalog reference ` +
        `"${existingVersionSpecifier}", which is "${catalogReference.resolvedVersion}". Rush will not replace ` +
        `the catalog reference with "${versionSpecifier}". Use the "${MAKE_CONSISTENT_FLAG_NAME}" flag to ` +
        `update the catalog entry in ${pnpmConfigFilePath} to "${version}", or specify ` +
        `"${packageName}@${existingVersionSpecifier}" to keep the catalog version.`
    );
  }

  /**
   * Returns the existing dependency that {@link PackageJsonUpdater.updateProject} replaces when it adds the
   * package with the specified dependency type.
   */
  #tryGetExistingDependency(
    project: VersionMismatchFinderEntity,
    packageName: string,
    dependencyType: DependencyType | undefined
  ): PackageJsonDependency | undefined {
    switch (dependencyType) {
      case undefined:
        return project.tryGetDevDependency(packageName) ?? project.tryGetDependency(packageName);
      case DependencyType.Dev:
        return project.tryGetDevDependency(packageName);
      default:
        return project.tryGetDependency(packageName);
    }
  }

  /**
   * If the project references the package through a PNPM catalog that has an entry for it, returns the
   * catalog reference. A reference to a catalog without an entry for the package is reported.
   */
  #tryGetResolvedCatalogReference(
    project: VersionMismatchFinderEntity,
    packageName: string,
    dependencyType: DependencyType,
    catalogs: PnpmCatalogs | undefined
  ): IPnpmCatalogReference | undefined {
    const versionSpecifier: string | undefined = this.#tryGetExistingDependency(
      project,
      packageName,
      dependencyType
    )?.version;
    if (versionSpecifier === undefined) {
      return undefined;
    }

    const catalogReference: IPnpmCatalogReference | undefined = tryResolvePnpmCatalogReference(
      packageName,
      versionSpecifier,
      catalogs
    );
    if (catalogReference?.resolvedVersion === undefined) {
      if (catalogReference) {
        this.#terminal.writeWarningLine(
          `"${project.friendlyName}" references "${packageName}" through "${versionSpecifier}", but that ` +
            'PNPM catalog does not have an entry for it. Replacing the reference with a version.'
        );
      }

      return undefined;
    }

    return catalogReference;
  }

  /**
   * Returns the version specifiers that the projects in the repo will use for the package after an upgrade,
   * resolving PNPM catalog references with the pending catalog changes. Peer dependencies and "workspace:"
   * references are ignored, like {@link IDependencyAnalysis.allVersionsByPackageName}.
   */
  #getVersionsAfterUpgrade(
    packageName: string,
    version: string,
    dependencyType: DependencyType,
    projectUpdatesByProject: ReadonlyMap<RushConfigurationProject, IUpgradeProjectUpdates>,
    pendingCatalogUpdates: PendingPnpmCatalogUpdates
  ): Set<string> {
    const result: Set<string> = new Set();
    for (const project of this.#rushConfiguration.projects) {
      const { packageJsonEditor } = project;
      for (const dependency of [
        packageJsonEditor.tryGetDependency(packageName),
        packageJsonEditor.tryGetDevDependency(packageName)
      ]) {
        if (!dependency || dependency.dependencyType === DependencyType.Peer) {
          continue;
        }

        let dependencyVersion: string = dependency.version;
        const catalogName: string | undefined = tryParsePnpmCatalogName(dependencyVersion);
        if (catalogName !== undefined) {
          const catalogVersion: string | undefined = tryGetPnpmCatalogVersion(
            pendingCatalogUpdates.getCatalogs(project.subspace),
            catalogName,
            packageName
          );
          if (catalogVersion === undefined) {
            continue;
          }

          dependencyVersion = catalogVersion;
        } else if (
          projectUpdatesByProject.has(project) &&
          (dependency.dependencyType === DependencyType.Dev) === (dependencyType === DependencyType.Dev)
        ) {
          // The upgrade replaces this version
          dependencyVersion = version;
        }

        if (!dependencyVersion.startsWith('workspace:')) {
          result.add(dependencyVersion);
        }
      }
    }

    return result;
  }

  #throwMismatchedVersionsError(
    packageName: string,
    version: string,
    existingVersions: Iterable<string>
  ): never {
    const existingVersionList: string = Array.from(existingVersions).join(', ');
    throw new Error(
      `Adding '${packageName}@${version}' ` +
        `causes mismatched dependencies. Use the "${MAKE_CONSISTENT_FLAG_NAME}" flag to update other packages to use ` +
        `this version, or try specify one of the existing versions (${existingVersionList}).`
    );
  }

  /**
   * Returns the changes that make the other projects (and common-versions.json) consistent with the new versions.
   *
   * @remarks
   * A project that references a package through a PNPM catalog keeps its catalog reference; the catalog
   * entry is updated instead.
   */
  #getUpdates(
    mismatchFinder: VersionMismatchFinder,
    versionByPackageName: ReadonlyMap<string, string>,
    subspace: Subspace,
    pendingCatalogUpdates: PendingPnpmCatalogUpdates
  ): IUpdateProjectOptions[] {
    const result: IUpdateProjectOptions[] = [];

    const { mismatches } = mismatchFinder;

    for (const [packageName, version] of versionByPackageName) {
      const projectsByVersion: ReadonlyMap<string, Iterable<VersionMismatchFinderEntity>> | undefined =
        mismatches.get(packageName);
      if (projectsByVersion) {
        for (const [existingVersion, consumers] of projectsByVersion) {
          for (const consumer of consumers) {
            // Never replace a PNPM catalog reference with a literal version: that would silently detach the
            // project from the catalog. Update the catalog entry instead.
            const catalogVersionSpecifier: string | undefined = this.#tryGetCatalogVersionSpecifierToUpdate(
              consumer,
              packageName
            );
            if (catalogVersionSpecifier !== undefined) {
              if (existingVersion !== version) {
                const catalogName: string = tryParsePnpmCatalogName(catalogVersionSpecifier)!;
                if (
                  tryGetPnpmCatalogVersion(
                    pendingCatalogUpdates.getCatalogs(subspace),
                    catalogName,
                    packageName
                  ) === undefined
                ) {
                  this.#reportUnresolvedCatalogReference(consumer, packageName, catalogVersionSpecifier);
                } else {
                  pendingCatalogUpdates.setVersion(subspace, catalogName, packageName, version);
                }
              }

              continue;
            }

            result.push({
              project: consumer,
              dependenciesToAddOrUpdateOrRemove: {
                [packageName]: version
              }
            });
          }
        }
      }
    }

    return result;
  }

  /**
   * If {@link PackageJsonUpdater.updateProject} would overwrite a PNPM catalog reference (such as `catalog:`)
   * when it updates the package in the project, returns that version specifier.
   */
  #tryGetCatalogVersionSpecifierToUpdate(
    project: VersionMismatchFinderEntity,
    packageName: string
  ): string | undefined {
    // Matches the dependency that updateProject() updates when it is not given a dependency type
    const versionSpecifier: string | undefined = this.#tryGetExistingDependency(
      project,
      packageName,
      undefined
    )?.version;
    return versionSpecifier !== undefined && tryParsePnpmCatalogName(versionSpecifier) !== undefined
      ? versionSpecifier
      : undefined;
  }

  #reportUnresolvedCatalogReference(
    project: VersionMismatchFinderEntity,
    packageName: string,
    catalogVersionSpecifier: string
  ): void {
    const key: string = `${project.friendlyName}\0${packageName}`;
    if (this.#reportedCatalogReferences.has(key)) {
      return;
    }

    this.#reportedCatalogReferences.add(key);
    this.#terminal.writeWarningLine(
      `Not updating "${packageName}" in "${project.friendlyName}" because its PNPM catalog reference ` +
        `"${catalogVersionSpecifier}" does not resolve: the catalog does not have an entry for ` +
        `"${packageName}". Add the entry to the catalog in pnpm-config.json.`
    );
  }

  /**
   * Remove a dependency from a particular project. The core business logic for "rush remove".
   */
  async #doRushRemoveAsync(options: IPackageJsonUpdaterRushRemoveOptions): Promise<IRemoveProjectOptions[]> {
    const { projects, packagesToUpdate } = options;

    this.#terminal.writeLine();
    const dependenciesToRemove: Record<string, string> = {};

    const allPackageUpdates: IRemoveProjectOptions[] = [];

    for (const project of projects) {
      for (const { packageName } of packagesToUpdate) {
        dependenciesToRemove[packageName] = '';
      }

      const currentProjectUpdate: IRemoveProjectOptions = {
        project: new VersionMismatchFinderProject(project),
        dependenciesToAddOrUpdateOrRemove: dependenciesToRemove
      };
      this.removePackageFromProject(currentProjectUpdate);

      allPackageUpdates.push(currentProjectUpdate);
    }

    return allPackageUpdates;
  }

  /**
   * Updates several projects' package.json files
   */
  public updateProjects(projectUpdates: IUpdateProjectOptions[]): void {
    for (const update of projectUpdates) {
      this.updateProject(update);
    }
  }

  /**
   * Updates a single project's package.json file
   */
  public updateProject(options: IUpdateProjectOptions): void {
    let { dependencyType } = options;
    const { project, dependenciesToAddOrUpdateOrRemove } = options;

    for (const [packageName, newVersion] of Object.entries(dependenciesToAddOrUpdateOrRemove)) {
      const oldDependency: PackageJsonDependency | undefined = project.tryGetDependency(packageName);
      const oldDevDependency: PackageJsonDependency | undefined = project.tryGetDevDependency(packageName);

      const oldDependencyType: DependencyType | undefined = oldDevDependency
        ? oldDevDependency.dependencyType
        : oldDependency
          ? oldDependency.dependencyType
          : undefined;

      dependencyType = dependencyType || oldDependencyType || DependencyType.Regular;

      project.addOrUpdateDependency(packageName, newVersion, dependencyType!);
    }
  }

  public removePackageFromProject(options: IRemoveProjectOptions): void {
    const { project, dependenciesToAddOrUpdateOrRemove } = options;

    for (const packageName of Object.keys(dependenciesToAddOrUpdateOrRemove)) {
      const packageJsonDependencies: (PackageJsonDependency | undefined)[] = [
        project.tryGetDependency(packageName),
        project.tryGetDevDependency(packageName)
      ];
      for (const packageJsonDependency of packageJsonDependencies) {
        if (!packageJsonDependency) {
          continue;
        }
        project.removeDependency(packageName, packageJsonDependency.dependencyType);
      }
    }
  }

  /**
   * Selects an appropriate version number for a particular package, given an optional initial SemVer spec.
   * If ensureConsistentVersions, tries to pick a version that will be consistent.
   * Otherwise, will choose the latest semver matching the initialSpec and append the proper range style.
   * @param projects - the projects which will have their package.json's updated
   * @param packageName - the name of the package to be used
   * @param initialSpec - a semver pattern that should be used to find the latest version matching the spec
   * @param implicitlyPreferredVersion - the implicitly preferred (aka common/primary) version of the package in use
   * @param rangeStyle - if this version is selected by querying registry, then this range specifier is prepended to
   *   the selected version.
   */
  async #getNormalizedVersionSpecAsync(
    projects: RushConfigurationProject[],
    packageName: string,
    initialSpec: string | undefined,
    implicitlyPreferredVersion: string | undefined,
    explicitlyPreferredVersion: string | undefined,
    rangeStyle: SemVerStyle,
    ensureConsistentVersions: boolean | undefined
  ): Promise<string> {
    this.#terminal.writeLine(Colorize.gray(`Determining new version for dependency: ${packageName}`));
    if (initialSpec) {
      this.#terminal.writeLine(`Specified version selector: ${Colorize.cyan(initialSpec)}`);
    } else {
      this.#terminal.writeLine(
        `No version selector was specified, so the version will be determined automatically.`
      );
    }
    this.#terminal.writeLine();

    // if ensureConsistentVersions => reuse the pinned version
    // else, query the registry and use the latest that satisfies semver spec
    if (initialSpec) {
      if (initialSpec === implicitlyPreferredVersion) {
        this.#terminal.writeLine(
          Colorize.green('Assigning "') +
            Colorize.cyan(initialSpec) +
            Colorize.green(
              `" for "${packageName}" because it matches what other projects are using in this repo.`
            )
        );
        return initialSpec;
      }

      if (initialSpec === explicitlyPreferredVersion) {
        this.#terminal.writeLine(
          Colorize.green('Assigning "') +
            Colorize.cyan(initialSpec) +
            Colorize.green(
              `" for "${packageName}" because it is the preferred version listed in ${RushConstants.commonVersionsFilename}.`
            )
        );
        return initialSpec;
      }
    }

    if (ensureConsistentVersions && !initialSpec) {
      if (implicitlyPreferredVersion) {
        this.#terminal.writeLine(
          `Assigning the version "${Colorize.cyan(implicitlyPreferredVersion)}" for "${packageName}" ` +
            'because it is already used by other projects in this repo.'
        );
        return implicitlyPreferredVersion;
      }

      if (explicitlyPreferredVersion) {
        this.#terminal.writeLine(
          `Assigning the version "${Colorize.cyan(explicitlyPreferredVersion)}" for "${packageName}" ` +
            `because it is the preferred version listed in ${RushConstants.commonVersionsFilename}.`
        );
        return explicitlyPreferredVersion;
      }
    }

    await InstallHelpers.ensureLocalPackageManagerAsync(
      this.#rushConfiguration,
      this.#rushGlobalFolder,
      RushConstants.defaultMaxInstallAttempts
    );

    const useWorkspaces: boolean = !!(
      this.#rushConfiguration.pnpmOptions && this.#rushConfiguration.pnpmOptions.useWorkspaces
    );
    const workspacePrefix: string = 'workspace:';

    // Trim 'workspace:' notation from the spec, since we're going to be tweaking the range
    if (useWorkspaces && initialSpec && initialSpec.startsWith(workspacePrefix)) {
      initialSpec = initialSpec.substring(workspacePrefix.length).trim();
    }

    // determine if the package is a project in the local repository and if the version exists
    const localProject: RushConfigurationProject | undefined = this.#tryGetLocalProject(
      packageName,
      projects
    );

    let selectedVersion: string | undefined;
    let selectedVersionPrefix: string = '';

    if (initialSpec && initialSpec !== 'latest') {
      this.#terminal.writeLine(Colorize.gray('Finding versions that satisfy the selector: ') + initialSpec);
      this.#terminal.writeLine();

      if (localProject !== undefined) {
        const version: string = localProject.packageJson.version;
        if (semver.satisfies(version, initialSpec)) {
          // For workspaces, assume that specifying the exact version means you always want to consume
          // the local project. Otherwise, use the exact local package version
          if (useWorkspaces) {
            selectedVersion = initialSpec === version ? '*' : initialSpec;
            selectedVersionPrefix = workspacePrefix;
          } else {
            selectedVersion = version;
          }
        } else {
          throw new Error(
            `The dependency being added ("${packageName}") is a project in the local Rush repository, ` +
              `but the version specifier provided (${initialSpec}) does not match the local project's version ` +
              `(${version}). Correct the version specifier, omit a version specifier, or include "${packageName}" as a ` +
              `cyclicDependencyProject if it is intended for "${packageName}" to come from an external feed and not ` +
              'from the local Rush repository.'
          );
        }
      } else {
        this.#terminal.writeLine(`Querying registry for all versions of "${packageName}"...`);

        let args: string[];
        if (this.#rushConfiguration.packageManager === 'yarn') {
          args = ['info', packageName, 'versions', '--json'];
        } else {
          args = ['view', packageName, 'versions', '--json'];
        }

        const allVersions: string = await Utilities.executeCommandAndCaptureOutputAsync({
          command: this.#rushConfiguration.packageManagerToolFilename,
          args,
          workingDirectory: this.#rushConfiguration.commonTempFolder
        });

        let versionList: string[];
        if (this.#rushConfiguration.packageManager === 'yarn') {
          versionList = JSON.parse(allVersions).data;
        } else {
          versionList = JSON.parse(allVersions);
        }

        this.#terminal.writeLine(Colorize.gray(`Found ${versionList.length} available versions.`));

        for (const version of versionList) {
          if (semver.satisfies(version, initialSpec)) {
            selectedVersion = initialSpec;
            this.#terminal.writeLine(
              `Found a version that satisfies ${initialSpec}: ${Colorize.cyan(version)}`
            );
            break;
          }
        }

        if (!selectedVersion) {
          throw new Error(
            `Unable to find a version of "${packageName}" that satisfies` +
              ` the version specifier "${initialSpec}"`
          );
        }
      }
    } else {
      if (localProject !== undefined) {
        // For workspaces, assume that no specified version range means you always want to consume
        // the local project. Otherwise, use the exact local package version
        if (useWorkspaces) {
          selectedVersion = '*';
          selectedVersionPrefix = workspacePrefix;
        } else {
          selectedVersion = localProject.packageJson.version;
        }
      } else {
        if (!this.#rushConfiguration.ensureConsistentVersions) {
          this.#terminal.writeLine(
            Colorize.gray(
              `The "ensureConsistentVersions" policy is NOT active, so we will assign the latest version.`
            )
          );
          this.#terminal.writeLine();
        }

        this.#terminal.writeLine(`Querying NPM registry for latest version of "${packageName}"...`);

        let args: string[];
        if (this.#rushConfiguration.packageManager === 'yarn') {
          args = ['info', packageName, 'dist-tags.latest', '--silent'];
        } else {
          args = ['view', `${packageName}@latest`, 'version'];
        }

        selectedVersion = (
          await Utilities.executeCommandAndCaptureOutputAsync({
            command: this.#rushConfiguration.packageManagerToolFilename,
            args,
            workingDirectory: this.#rushConfiguration.commonTempFolder
          })
        ).trim();
      }

      this.#terminal.writeLine();

      this.#terminal.writeLine(`Found latest version: ${Colorize.cyan(selectedVersion)}`);
    }

    this.#terminal.writeLine();

    let reasonForModification: string = '';
    if (selectedVersion !== '*') {
      switch (rangeStyle) {
        case SemVerStyle.Caret: {
          selectedVersionPrefix += '^';
          reasonForModification = ' because the "--caret" flag was specified';
          break;
        }

        case SemVerStyle.Exact: {
          reasonForModification = ' because the "--exact" flag was specified';
          break;
        }

        case SemVerStyle.Tilde: {
          selectedVersionPrefix += '~';
          break;
        }

        case SemVerStyle.Passthrough: {
          break;
        }

        default: {
          throw new Error(`Unexpected SemVerStyle ${rangeStyle}.`);
        }
      }
    }

    const normalizedVersion: string = selectedVersionPrefix + selectedVersion;
    this.#terminal.writeLine(
      Colorize.gray(`Assigning version "${normalizedVersion}" for "${packageName}"${reasonForModification}.`)
    );
    return normalizedVersion;
  }

  #collectAllDownstreamDependencies(project: RushConfigurationProject): Set<RushConfigurationProject> {
    const allProjectDownstreamDependencies: Set<RushConfigurationProject> =
      new Set<RushConfigurationProject>();

    const collectDependencies: (rushProject: RushConfigurationProject) => void = (
      rushProject: RushConfigurationProject
    ) => {
      for (const downstreamDependencyProject of rushProject.downstreamDependencyProjects) {
        const foundProject: RushConfigurationProject | undefined =
          this.#rushConfiguration.projectsByName.get(downstreamDependencyProject);

        if (!foundProject) {
          continue;
        }

        if (foundProject.decoupledLocalDependencies.has(rushProject.packageName)) {
          continue;
        }

        if (!allProjectDownstreamDependencies.has(foundProject)) {
          allProjectDownstreamDependencies.add(foundProject);
          collectDependencies(foundProject);
        }
      }
    };

    collectDependencies(project);
    return allProjectDownstreamDependencies;
  }

  /**
   * Given a package name, this function returns a {@see RushConfigurationProject} if the package is a project
   * in the local Rush repo and is not marked as cyclic for any of the projects.
   *
   * @remarks
   * This function throws an error if adding the discovered local project as a dependency
   * would create a dependency cycle, or if it would be added to multiple projects.
   */
  #tryGetLocalProject(
    packageName: string,
    projects: RushConfigurationProject[]
  ): RushConfigurationProject | undefined {
    const foundProject: RushConfigurationProject | undefined =
      this.#rushConfiguration.projectsByName.get(packageName);

    if (foundProject === undefined) {
      return undefined;
    }

    if (projects.length > 1) {
      throw new Error(
        `"rush add" does not support adding a local project as a dependency to multiple projects at once.`
      );
    }

    const project: RushConfigurationProject = projects[0];

    if (project.decoupledLocalDependencies.has(foundProject.packageName)) {
      return undefined;
    }

    // Are we attempting to add this project to itself?
    if (project === foundProject) {
      throw new Error(
        'Unable to add a project as a dependency of itself unless the dependency is listed as a cyclic dependency ' +
          `in ${RushConstants.rushJsonFilename}. This command attempted to add "${foundProject.packageName}" ` +
          `as a dependency of itself.`
      );
    }

    // Are we attempting to create a cycle?
    const downstreamDependencies: Set<RushConfigurationProject> =
      this.#collectAllDownstreamDependencies(project);
    if (downstreamDependencies.has(foundProject)) {
      throw new Error(
        `Adding "${foundProject.packageName}" as a direct or indirect dependency of ` +
          `"${project.packageName}" would create a dependency cycle.`
      );
    }

    return foundProject;
  }

  #cheaplyDetectSemVerRangeStyle(version: string): SemVerStyle {
    // create a swtich statement to detect the first character of the version string and determine the range style
    // TODO: This is a temporary solution until we have a better way to detect more complext range styles
    // TODO: Should we handle/care about peerDependencies?
    switch (version[0]) {
      case '~':
        return SemVerStyle.Tilde;
      case '^':
        return SemVerStyle.Caret;
      default:
        this.#terminal.writeLine(
          `No SemVer range detected for version: ${version}. The exact version will be set in package.json.`
        );
        return SemVerStyle.Exact;
    }
  }

  #normalizeDepsToUpgrade(deps: INpmCheckPackageSummary[]): IPackageForRushAdd[] {
    return deps.map((dep) => {
      return {
        packageName: dep.moduleName,
        version: dep.latest,
        rangeStyle: this.#cheaplyDetectSemVerRangeStyle(dep.packageJson)
      };
    });
  }
}
