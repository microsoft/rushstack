// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference path="../npm-check-typings.d.ts" preserve="true" />

import * as semver from 'semver';
import type * as NpmCheck from 'npm-check';

import { Colorize, type ITerminal } from '@rushstack/terminal';

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
  packagesToAdd: NpmCheck.INpmCheckPackage[];
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
 * A helper class for managing the dependencies of various package.json files.
 * @internal
 */
export class PackageJsonUpdater {
  private readonly _terminal: ITerminal;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _rushGlobalFolder: RushGlobalFolder;

  public constructor(
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    rushGlobalFolder: RushGlobalFolder
  ) {
    this._terminal = terminal;
    this._rushConfiguration = rushConfiguration;
    this._rushGlobalFolder = rushGlobalFolder;
  }

  /**
   * Upgrade dependencies to a particular project, or across specified projects. This is the core business logic for
   * "rush upgrade-interactive".
   */
  public async doRushUpgradeAsync(options: IPackageJsonUpdaterRushUpgradeOptions): Promise<void> {
    const { projects, packagesToAdd, updateOtherPackages, skipUpdate, debugInstall, variant } = options;
    const { DependencyAnalyzer } = await import(
      /* webpackChunkName: 'DependencyAnalyzer' */
      './DependencyAnalyzer'
    );
    const dependencyAnalyzer: DependencyAnalyzer = DependencyAnalyzer.forRushConfiguration(
      this._rushConfiguration
    );
    const {
      allVersionsByPackageName,
      implicitlyPreferredVersionByPackageName,
      commonVersionsConfiguration
    }: IDependencyAnalysis = dependencyAnalyzer.getAnalysis(undefined, variant, false);

    const dependenciesToUpdate: Record<string, string> = {};
    const devDependenciesToUpdate: Record<string, string> = {};
    const peerDependenciesToUpdate: Record<string, string> = {};

    for (const {
      moduleName,
      latest: latestVersion,
      packageJson,
      devDependency,
      peerDependency
    } of packagesToAdd) {
      const inferredRangeStyle: SemVerStyle = this._cheaplyDetectSemVerRangeStyle(packageJson);
      const implicitlyPreferredVersion: string | undefined =
        implicitlyPreferredVersionByPackageName.get(moduleName);

      const explicitlyPreferredVersion: string | undefined =
        commonVersionsConfiguration.preferredVersions.get(moduleName);

      const version: string = await this._getNormalizedVersionSpecAsync(
        projects,
        moduleName,
        latestVersion,
        implicitlyPreferredVersion,
        explicitlyPreferredVersion,
        inferredRangeStyle,
        commonVersionsConfiguration.ensureConsistentVersions
      );

      if (devDependency) {
        devDependenciesToUpdate[moduleName] = version;
      } else if (peerDependency) {
        peerDependenciesToUpdate[moduleName] = version;
      } else {
        dependenciesToUpdate[moduleName] = version;
      }

      this._terminal.writeLine(
        Colorize.green(`Updating projects to use `) + moduleName + '@' + Colorize.cyan(version)
      );
      this._terminal.writeLine();

      const existingSpecifiedVersions: Set<string> | undefined = allVersionsByPackageName.get(moduleName);
      if (
        existingSpecifiedVersions &&
        !existingSpecifiedVersions.has(version) &&
        commonVersionsConfiguration.ensureConsistentVersions &&
        !updateOtherPackages
      ) {
        // There are existing versions, and the version we're going to use is not one of them, and this repo
        // requires consistent versions, and we aren't going to update other packages, so we can't proceed.

        const existingVersionList: string = Array.from(existingSpecifiedVersions).join(', ');
        throw new Error(
          `Adding '${moduleName}@${version}' ` +
            `causes mismatched dependencies. Use the "--make-consistent" flag to update other packages to use ` +
            `this version, or try specify one of the existing versions (${existingVersionList}).`
        );
      }
    }

    const allPackageUpdates: Map<string, VersionMismatchFinderEntity> = new Map();
    const allDependenciesToUpdate: [string, string][] = [
      ...Object.entries(dependenciesToUpdate),
      ...Object.entries(devDependenciesToUpdate),
      ...Object.entries(peerDependenciesToUpdate)
    ];

    for (const project of projects) {
      const mismatchFinderProject: VersionMismatchFinderProject = new VersionMismatchFinderProject(project);

      const currentProjectDepUpdate: IUpdateProjectOptions = {
        project: mismatchFinderProject,
        dependenciesToAddOrUpdateOrRemove: dependenciesToUpdate,
        dependencyType: DependencyType.Regular
      };

      const currentProjectDevDepUpdate: IUpdateProjectOptions = {
        project: mismatchFinderProject,
        dependenciesToAddOrUpdateOrRemove: devDependenciesToUpdate,
        dependencyType: DependencyType.Dev
      };

      allPackageUpdates.set(mismatchFinderProject.filePath, mismatchFinderProject);

      this.updateProject(currentProjectDepUpdate);
      this.updateProject(currentProjectDevDepUpdate);
    }

    if (updateOtherPackages) {
      const mismatchFinder: VersionMismatchFinder = VersionMismatchFinder.getMismatches(
        this._rushConfiguration,
        options
      );
      for (const update of this._getUpdates(mismatchFinder, allDependenciesToUpdate)) {
        this.updateProject(update);
        allPackageUpdates.set(update.project.filePath, update.project);
      }
    }

    for (const [filePath, project] of allPackageUpdates) {
      if (project.saveIfModified()) {
        this._terminal.writeLine(Colorize.green('Wrote ') + filePath);
      }
    }

    if (!skipUpdate) {
      if (this._rushConfiguration.subspacesFeatureEnabled) {
        const subspaceSet: ReadonlySet<Subspace> = this._rushConfiguration.getSubspacesForProjects(
          options.projects
        );
        for (const subspace of subspaceSet) {
          await this._doUpdateAsync(debugInstall, subspace, variant);
        }
      } else {
        await this._doUpdateAsync(debugInstall, this._rushConfiguration.defaultSubspace, variant);
      }
    }
  }

  public async doRushUpdateAsync(options: IPackageJsonUpdaterRushBaseUpdateOptions): Promise<void> {
    let allPackageUpdates: IUpdateProjectOptions[] = [];
    if (options.actionName === 'add') {
      allPackageUpdates = await this._doRushAddAsync(options as IPackageJsonUpdaterRushAddOptions);
    } else if (options.actionName === 'remove') {
      allPackageUpdates = await this._doRushRemoveAsync(options as IPackageJsonUpdaterRushRemoveOptions);
    } else {
      throw new Error('only accept "rush add" or "rush remove"');
    }
    const { skipUpdate, debugInstall, variant } = options;
    for (const { project } of allPackageUpdates) {
      if (project.saveIfModified()) {
        this._terminal.writeLine(Colorize.green('Wrote'), project.filePath);
      }
    }

    if (!skipUpdate) {
      if (this._rushConfiguration.subspacesFeatureEnabled) {
        const subspaceSet: ReadonlySet<Subspace> = this._rushConfiguration.getSubspacesForProjects(
          options.projects
        );
        for (const subspace of subspaceSet) {
          await this._doUpdateAsync(debugInstall, subspace, variant);
        }
      } else {
        await this._doUpdateAsync(debugInstall, this._rushConfiguration.defaultSubspace, variant);
      }
    }
  }

  private async _doUpdateAsync(
    debugInstall: boolean,
    subspace: Subspace,
    variant: string | undefined
  ): Promise<void> {
    this._terminal.writeLine();
    this._terminal.writeLine(Colorize.green('Running "rush update"'));
    this._terminal.writeLine();

    const purgeManager: PurgeManager = new PurgeManager(this._rushConfiguration, this._rushGlobalFolder);
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
      selectedProjects: new Set(this._rushConfiguration.projects),
      checkOnly: false,
      subspace: subspace,
      terminal: this._terminal
    };

    const installManager: BaseInstallManager = await InstallManagerFactory.getInstallManagerAsync(
      this._rushConfiguration,
      this._rushGlobalFolder,
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
  private async _doRushAddAsync(
    options: IPackageJsonUpdaterRushAddOptions
  ): Promise<IUpdateProjectOptions[]> {
    const { projects } = options;

    const { DependencyAnalyzer } = await import(
      /* webpackChunkName: 'DependencyAnalyzer' */
      './DependencyAnalyzer'
    );
    const dependencyAnalyzer: DependencyAnalyzer = DependencyAnalyzer.forRushConfiguration(
      this._rushConfiguration
    );

    const allPackageUpdates: IUpdateProjectOptions[] = [];
    const subspaceSet: ReadonlySet<Subspace> = this._rushConfiguration.getSubspacesForProjects(projects);
    for (const subspace of subspaceSet) {
      // Projects for this subspace
      allPackageUpdates.push(...(await this._updateProjectsAsync(subspace, dependencyAnalyzer, options)));
    }

    return allPackageUpdates;
  }

  private async _updateProjectsAsync(
    subspace: Subspace,
    dependencyAnalyzer: DependencyAnalyzer,
    options: IPackageJsonUpdaterRushAddOptions
  ): Promise<IUpdateProjectOptions[]> {
    const { projects, packagesToUpdate, devDependency, peerDependency, updateOtherPackages, variant } =
      options;

    // Get projects for this subspace
    const subspaceProjects: RushConfigurationProject[] = projects.filter(
      (project) => project.subspace === subspace
    );

    const {
      allVersionsByPackageName,
      implicitlyPreferredVersionByPackageName,
      commonVersionsConfiguration
    }: IDependencyAnalysis = dependencyAnalyzer.getAnalysis(subspace, variant, options.actionName === 'add');

    this._terminal.writeLine();
    const dependenciesToAddOrUpdate: Record<string, string> = {};
    for (const { packageName, version: initialVersion, rangeStyle } of packagesToUpdate) {
      const implicitlyPreferredVersion: string | undefined =
        implicitlyPreferredVersionByPackageName.get(packageName);

      const explicitlyPreferredVersion: string | undefined =
        commonVersionsConfiguration.preferredVersions.get(packageName);

      const version: string = await this._getNormalizedVersionSpecAsync(
        subspaceProjects,
        packageName,
        initialVersion,
        implicitlyPreferredVersion,
        explicitlyPreferredVersion,
        rangeStyle,
        commonVersionsConfiguration.ensureConsistentVersions
      );

      dependenciesToAddOrUpdate[packageName] = version;
      this._terminal.writeLine(
        Colorize.green('Updating projects to use '),
        `${packageName}@`,
        Colorize.cyan(version)
      );
      this._terminal.writeLine();

      const existingSpecifiedVersions: Set<string> | undefined = allVersionsByPackageName.get(packageName);
      if (
        existingSpecifiedVersions &&
        !existingSpecifiedVersions.has(version) &&
        commonVersionsConfiguration.ensureConsistentVersions &&
        !updateOtherPackages
      ) {
        // There are existing versions, and the version we're going to use is not one of them, and this repo
        // requires consistent versions, and we aren't going to update other packages, so we can't proceed.

        const existingVersionList: string = Array.from(existingSpecifiedVersions).join(', ');
        throw new Error(
          `Adding '${packageName}@${version}' ` +
            `causes mismatched dependencies. Use the "--make-consistent" flag to update other packages to use ` +
            `this version, or try specify one of the existing versions (${existingVersionList}).`
        );
      }
    }

    const allPackageUpdates: IUpdateProjectOptions[] = [];

    for (const project of subspaceProjects) {
      const currentProjectUpdate: IUpdateProjectOptions = {
        project: new VersionMismatchFinderProject(project),
        dependenciesToAddOrUpdateOrRemove: dependenciesToAddOrUpdate,
        dependencyType: devDependency ? DependencyType.Dev : peerDependency ? DependencyType.Peer : undefined
      };
      this.updateProject(currentProjectUpdate);

      let otherPackageUpdates: IUpdateProjectOptions[] = [];

      // we need to do a mismatch check
      if (updateOtherPackages) {
        const mismatchFinder: VersionMismatchFinder = VersionMismatchFinder.getMismatches(
          this._rushConfiguration,
          {
            subspace,
            variant
          }
        );
        otherPackageUpdates = this._getUpdates(mismatchFinder, Object.entries(dependenciesToAddOrUpdate));
      }

      this.updateProjects(otherPackageUpdates);

      allPackageUpdates.push(currentProjectUpdate, ...otherPackageUpdates);
    }

    return allPackageUpdates;
  }

  private _getUpdates(
    mismatchFinder: VersionMismatchFinder,
    dependenciesToUpdate: Iterable<[string, string]>
  ): IUpdateProjectOptions[] {
    const result: IUpdateProjectOptions[] = [];

    const { mismatches } = mismatchFinder;

    for (const [packageName, version] of dependenciesToUpdate) {
      const projectsByVersion: ReadonlyMap<string, Iterable<VersionMismatchFinderEntity>> | undefined =
        mismatches.get(packageName);
      if (projectsByVersion) {
        for (const consumers of projectsByVersion.values()) {
          for (const consumer of consumers) {
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
   * Remove a dependency from a particular project. The core business logic for "rush remove".
   */
  private async _doRushRemoveAsync(
    options: IPackageJsonUpdaterRushRemoveOptions
  ): Promise<IRemoveProjectOptions[]> {
    const { projects, packagesToUpdate } = options;

    this._terminal.writeLine();
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
  private async _getNormalizedVersionSpecAsync(
    projects: RushConfigurationProject[],
    packageName: string,
    initialSpec: string | undefined,
    implicitlyPreferredVersion: string | undefined,
    explicitlyPreferredVersion: string | undefined,
    rangeStyle: SemVerStyle,
    ensureConsistentVersions: boolean | undefined
  ): Promise<string> {
    this._terminal.writeLine(Colorize.gray(`Determining new version for dependency: ${packageName}`));
    if (initialSpec) {
      this._terminal.writeLine(`Specified version selector: ${Colorize.cyan(initialSpec)}`);
    } else {
      this._terminal.writeLine(
        `No version selector was specified, so the version will be determined automatically.`
      );
    }
    this._terminal.writeLine();

    // if ensureConsistentVersions => reuse the pinned version
    // else, query the registry and use the latest that satisfies semver spec
    if (initialSpec) {
      if (initialSpec === implicitlyPreferredVersion) {
        this._terminal.writeLine(
          Colorize.green('Assigning "') +
            Colorize.cyan(initialSpec) +
            Colorize.green(
              `" for "${packageName}" because it matches what other projects are using in this repo.`
            )
        );
        return initialSpec;
      }

      if (initialSpec === explicitlyPreferredVersion) {
        this._terminal.writeLine(
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
        this._terminal.writeLine(
          `Assigning the version "${Colorize.cyan(implicitlyPreferredVersion)}" for "${packageName}" ` +
            'because it is already used by other projects in this repo.'
        );
        return implicitlyPreferredVersion;
      }

      if (explicitlyPreferredVersion) {
        this._terminal.writeLine(
          `Assigning the version "${Colorize.cyan(explicitlyPreferredVersion)}" for "${packageName}" ` +
            `because it is the preferred version listed in ${RushConstants.commonVersionsFilename}.`
        );
        return explicitlyPreferredVersion;
      }
    }

    await InstallHelpers.ensureLocalPackageManagerAsync(
      this._rushConfiguration,
      this._rushGlobalFolder,
      RushConstants.defaultMaxInstallAttempts
    );

    const useWorkspaces: boolean = !!(
      this._rushConfiguration.pnpmOptions && this._rushConfiguration.pnpmOptions.useWorkspaces
    );
    const workspacePrefix: string = 'workspace:';

    // Trim 'workspace:' notation from the spec, since we're going to be tweaking the range
    if (useWorkspaces && initialSpec && initialSpec.startsWith(workspacePrefix)) {
      initialSpec = initialSpec.substring(workspacePrefix.length).trim();
    }

    // determine if the package is a project in the local repository and if the version exists
    const localProject: RushConfigurationProject | undefined = this._tryGetLocalProject(
      packageName,
      projects
    );

    let selectedVersion: string | undefined;
    let selectedVersionPrefix: string = '';

    if (initialSpec && initialSpec !== 'latest') {
      this._terminal.writeLine(Colorize.gray('Finding versions that satisfy the selector: ') + initialSpec);
      this._terminal.writeLine();

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
        this._terminal.writeLine(`Querying registry for all versions of "${packageName}"...`);

        let commandArgs: string[];
        if (this._rushConfiguration.packageManager === 'yarn') {
          commandArgs = ['info', packageName, 'versions', '--json'];
        } else {
          commandArgs = ['view', packageName, 'versions', '--json'];
        }

        const allVersions: string = await Utilities.executeCommandAndCaptureOutputAsync(
          this._rushConfiguration.packageManagerToolFilename,
          commandArgs,
          this._rushConfiguration.commonTempFolder
        );

        let versionList: string[];
        if (this._rushConfiguration.packageManager === 'yarn') {
          versionList = JSON.parse(allVersions).data;
        } else {
          versionList = JSON.parse(allVersions);
        }

        this._terminal.writeLine(Colorize.gray(`Found ${versionList.length} available versions.`));

        for (const version of versionList) {
          if (semver.satisfies(version, initialSpec)) {
            selectedVersion = initialSpec;
            this._terminal.writeLine(
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
        if (!this._rushConfiguration.ensureConsistentVersions) {
          this._terminal.writeLine(
            Colorize.gray(
              `The "ensureConsistentVersions" policy is NOT active, so we will assign the latest version.`
            )
          );
          this._terminal.writeLine();
        }

        this._terminal.writeLine(`Querying NPM registry for latest version of "${packageName}"...`);

        let commandArgs: string[];
        if (this._rushConfiguration.packageManager === 'yarn') {
          commandArgs = ['info', packageName, 'dist-tags.latest', '--silent'];
        } else {
          commandArgs = ['view', `${packageName}@latest`, 'version'];
        }

        selectedVersion = (
          await Utilities.executeCommandAndCaptureOutputAsync(
            this._rushConfiguration.packageManagerToolFilename,
            commandArgs,
            this._rushConfiguration.commonTempFolder
          )
        ).trim();
      }

      this._terminal.writeLine();

      this._terminal.writeLine(`Found latest version: ${Colorize.cyan(selectedVersion)}`);
    }

    this._terminal.writeLine();

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
    this._terminal.writeLine(
      Colorize.gray(`Assigning version "${normalizedVersion}" for "${packageName}"${reasonForModification}.`)
    );
    return normalizedVersion;
  }

  private _collectAllDownstreamDependencies(
    project: RushConfigurationProject
  ): Set<RushConfigurationProject> {
    const allProjectDownstreamDependencies: Set<RushConfigurationProject> =
      new Set<RushConfigurationProject>();

    const collectDependencies: (rushProject: RushConfigurationProject) => void = (
      rushProject: RushConfigurationProject
    ) => {
      for (const downstreamDependencyProject of rushProject.downstreamDependencyProjects) {
        const foundProject: RushConfigurationProject | undefined =
          this._rushConfiguration.projectsByName.get(downstreamDependencyProject);

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
  private _tryGetLocalProject(
    packageName: string,
    projects: RushConfigurationProject[]
  ): RushConfigurationProject | undefined {
    const foundProject: RushConfigurationProject | undefined =
      this._rushConfiguration.projectsByName.get(packageName);

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
      this._collectAllDownstreamDependencies(project);
    if (downstreamDependencies.has(foundProject)) {
      throw new Error(
        `Adding "${foundProject.packageName}" as a direct or indirect dependency of ` +
          `"${project.packageName}" would create a dependency cycle.`
      );
    }

    return foundProject;
  }

  private _cheaplyDetectSemVerRangeStyle(version: string): SemVerStyle {
    // create a swtich statement to detect the first character of the version string and determine the range style
    // TODO: This is a temporary solution until we have a better way to detect more complext range styles
    // TODO: Should we handle/care about peerDependencies?
    switch (version[0]) {
      case '~':
        return SemVerStyle.Tilde;
      case '^':
        return SemVerStyle.Caret;
      default:
        this._terminal.writeLine(
          `No SemVer range detected for version: ${version}. The exact version will be set in package.json.`
        );
        return SemVerStyle.Exact;
    }
  }

  private _normalizeDepsToUpgrade(deps: NpmCheck.INpmCheckPackage[]): IPackageForRushAdd[] {
    return deps.map((dep) => {
      return {
        packageName: dep.moduleName,
        version: dep.latest,
        rangeStyle: this._cheaplyDetectSemVerRangeStyle(dep.packageJson)
      };
    });
  }
}
