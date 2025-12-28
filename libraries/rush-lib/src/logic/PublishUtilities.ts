// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This file contains a set of helper functions that are unit tested and used with the PublishAction,
 * which itself is a thin wrapper around these helpers.
 */

import * as path from 'node:path';
import { execSync } from 'node:child_process';

import * as semver from 'semver';

import {
  type IPackageJson,
  JsonFile,
  FileConstants,
  Text,
  Enum,
  InternalError
} from '@rushstack/node-core-library';

import { type IChangeInfo, ChangeType, type IVersionPolicyChangeInfo } from '../api/ChangeManagement';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import { Utilities, type IEnvironment } from '../utilities/Utilities';
import type { PrereleaseToken } from './PrereleaseToken';
import type { ChangeFiles } from './ChangeFiles';
import type { RushConfiguration } from '../api/RushConfiguration';
import { DependencySpecifier, DependencySpecifierType } from './DependencySpecifier';
import { Git, DEFAULT_GIT_TAG_SEPARATOR } from './Git';
import type { LockStepVersionPolicy } from '../api/VersionPolicy';

export interface IChangeRequests {
  packageChanges: Map<string, IChangeInfo>;
  versionPolicyChanges: Map<string, IVersionPolicyChangeInfo>;
}

export interface IExecCommandOptions {
  shouldExecute: boolean;
  command: string;
  args?: string[];
  workingDirectory?: string;
  environment?: IEnvironment;
  secretSubstring?: string;
  shell?: boolean;
}

interface IAddChangeOptions {
  change: IChangeInfo;
  changeFilePath?: string;
  allChanges: IChangeRequests;
  allPackages: ReadonlyMap<string, RushConfigurationProject>;
  rushConfiguration: RushConfiguration;
  prereleaseToken?: PrereleaseToken;
  projectsToExclude?: Set<string>;
}

const MAGIC_SPECIFIERS: Set<string> = new Set<string>(['*', '^', '~']);

export class PublishUtilities {
  /**
   * Finds change requests in the given folder.
   * @param changesPath Path to the changes folder.
   * @returns Dictionary of all change requests, keyed by package name.
   */
  public static async findChangeRequestsAsync(
    allPackages: ReadonlyMap<string, RushConfigurationProject>,
    rushConfiguration: RushConfiguration,
    changeFiles: ChangeFiles,
    includeCommitDetails?: boolean,
    prereleaseToken?: PrereleaseToken,
    projectsToExclude?: Set<string>
  ): Promise<IChangeRequests> {
    const allChanges: IChangeRequests = {
      packageChanges: new Map<string, IChangeInfo>(),
      versionPolicyChanges: new Map<string, IVersionPolicyChangeInfo>()
    };

    // eslint-disable-next-line no-console
    console.log(`Finding changes in: ${changeFiles.getChangesPath()}`);

    const files: string[] = await changeFiles.getFilesAsync();

    // Add the minimum changes defined by the change descriptions.
    for (const changeFilePath of files) {
      const changeRequest: IChangeInfo = JsonFile.load(changeFilePath);

      if (includeCommitDetails) {
        const git: Git = new Git(rushConfiguration);
        PublishUtilities._updateCommitDetails(git, changeFilePath, changeRequest.changes);
      }

      for (const change of changeRequest.changes!) {
        PublishUtilities._addChange({
          change,
          changeFilePath,
          allChanges,
          allPackages,
          rushConfiguration,
          prereleaseToken,
          projectsToExclude
        });
      }
    }

    // keep resolving downstream dependency changes and version policy changes
    // until no more changes are detected
    let hasChanges: boolean;
    do {
      hasChanges = false;

      // For each requested package change, ensure downstream dependencies are also updated.
      allChanges.packageChanges.forEach((change, packageName) => {
        hasChanges =
          PublishUtilities._updateDownstreamDependencies(
            change,
            allChanges,
            allPackages,
            rushConfiguration,
            prereleaseToken,
            projectsToExclude
          ) || hasChanges;
      });

      // Bump projects affected by the version policy changes.
      allPackages.forEach((project) => {
        const versionPolicyChange: IVersionPolicyChangeInfo | undefined =
          project.versionPolicyName !== undefined
            ? allChanges.versionPolicyChanges.get(project.versionPolicyName)
            : undefined;

        if (versionPolicyChange === undefined) {
          return;
        }

        const projectHasChanged: boolean = this._addChange({
          change: {
            packageName: project.packageName,
            changeType: versionPolicyChange.changeType,
            newVersion: versionPolicyChange.newVersion // enforce the specific policy version
          },
          allChanges,
          allPackages,
          rushConfiguration,
          prereleaseToken,
          projectsToExclude
        });

        if (projectHasChanged) {
          // eslint-disable-next-line no-console
          console.log(
            `\n* APPLYING: update ${project.packageName} to version ${versionPolicyChange.newVersion}`
          );
        }

        hasChanges = projectHasChanged || hasChanges;
      });
    } while (hasChanges);

    // Update orders so that downstreams are marked to come after upstreams.
    allChanges.packageChanges.forEach((change, packageName) => {
      const project: RushConfigurationProject = allPackages.get(packageName)!;
      const packageJson: IPackageJson = project.packageJson;
      const deps: Iterable<RushConfigurationProject> = project.consumingProjects;

      // Write the new version expected for the change.
      const skipVersionBump: boolean = PublishUtilities._shouldSkipVersionBump(
        project,
        prereleaseToken,
        projectsToExclude
      );
      if (skipVersionBump) {
        change.newVersion = packageJson.version;
      } else {
        // For hotfix changes, do not re-write new version
        change.newVersion =
          change.changeType! >= ChangeType.patch
            ? semver.inc(packageJson.version, PublishUtilities._getReleaseType(change.changeType!))!
            : change.changeType === ChangeType.hotfix
              ? change.newVersion
              : packageJson.version;
      }

      if (deps) {
        for (const dep of deps) {
          const depChange: IChangeInfo | undefined = allChanges.packageChanges.get(dep.packageName);
          if (depChange) {
            depChange.order = Math.max(change.order! + 1, depChange.order!);
          }
        }
      }
    });

    return allChanges;
  }

  /**
   * Given the changes hash, flattens them into a sorted array based on their dependency order.
   * @params packageChanges - hash of change requests.
   * @returns Sorted array of change requests.
   */
  public static sortChangeRequests(packageChanges: Map<string, IChangeInfo>): IChangeInfo[] {
    return [...packageChanges.values()].sort((a, b) =>
      a.order! === b.order! ? a.packageName.localeCompare(b.packageName) : a.order! < b.order! ? -1 : 1
    );
  }

  /**
   * Given a single change request, updates the package json file with updated versions on disk.
   */
  public static updatePackages(
    allChanges: IChangeRequests,
    allPackages: ReadonlyMap<string, RushConfigurationProject>,
    rushConfiguration: RushConfiguration,
    shouldCommit: boolean,
    prereleaseToken?: PrereleaseToken,
    projectsToExclude?: Set<string>
  ): Map<string, IPackageJson> {
    const updatedPackages: Map<string, IPackageJson> = new Map<string, IPackageJson>();

    allChanges.packageChanges.forEach((change, packageName) => {
      const updatedPackage: IPackageJson = PublishUtilities._writePackageChanges(
        change,
        allChanges,
        allPackages,
        rushConfiguration,
        shouldCommit,
        prereleaseToken,
        projectsToExclude
      );
      updatedPackages.set(updatedPackage.name, updatedPackage);
    });

    return updatedPackages;
  }

  /**
   * Returns the generated tagname to use for a published commit, given package name and version.
   */
  public static createTagname(
    packageName: string,
    version: string,
    separator: string = DEFAULT_GIT_TAG_SEPARATOR
  ): string {
    return packageName + `${separator}v` + version;
  }

  public static isRangeDependency(version: string): boolean {
    const LOOSE_PKG_REGEX: RegExp = />=?(?:\d+\.){2}\d+(\-[0-9A-Za-z-.]*)?\s+<(?:\d+\.){2}\d+/;

    return LOOSE_PKG_REGEX.test(version);
  }

  public static getEnvArgs(): { [key: string]: string | undefined } {
    const env: { [key: string]: string | undefined } = {};

    // Copy existing process.env values (for nodist)
    Object.keys(process.env).forEach((key: string) => {
      env[key] = process.env[key];
    });
    return env;
  }

  /**
   * @param secretSubstring -- if specified, a substring to be replaced by `<<SECRET>>` to avoid printing secrets
   * on the console
   */
  public static async execCommandAsync(options: IExecCommandOptions): Promise<void> {
    const {
      shouldExecute,
      command,
      args = [],
      workingDirectory = process.cwd(),
      environment,
      secretSubstring,
      shell
    } = options;

    let relativeDirectory: string = path.relative(process.cwd(), workingDirectory);

    if (relativeDirectory) {
      relativeDirectory = `(${relativeDirectory})`;
    }

    let commandArgs: string = args.join(' ');

    if (secretSubstring && secretSubstring.length > 0) {
      // Avoid printing the NPM publish token on the console when displaying the commandArgs
      commandArgs = Text.replaceAll(commandArgs, secretSubstring, '<<SECRET>>');
    }

    // eslint-disable-next-line no-console
    console.log(
      `\n* ${shouldExecute ? 'EXECUTING' : 'DRYRUN'}: ${command} ${commandArgs} ${relativeDirectory}`
    );

    if (shouldExecute) {
      await Utilities.executeCommandAsync({
        command,
        args,
        workingDirectory,
        environment,
        suppressOutput: false,
        keepEnvironment: true,
        shell
      });
    }
  }

  public static getNewDependencyVersion(
    dependencies: { [key: string]: string },
    dependencyName: string,
    newProjectVersion: string
  ): string {
    const currentDependencySpecifier: DependencySpecifier = DependencySpecifier.parseWithCache(
      dependencyName,
      dependencies[dependencyName]
    );
    const currentDependencyVersion: string = currentDependencySpecifier.versionSpecifier;
    let newDependencyVersion: string;

    if (MAGIC_SPECIFIERS.has(currentDependencyVersion)) {
      // pnpm and yarn support `workspace:*', `workspace:~`, and `workspace:^` as valid version specifiers
      // These translate as `current`, `~current`, and `^current` when published
      newDependencyVersion = currentDependencyVersion;
    } else if (PublishUtilities.isRangeDependency(currentDependencyVersion)) {
      newDependencyVersion = PublishUtilities._getNewRangeDependency(newProjectVersion);
    } else if (currentDependencyVersion.lastIndexOf('~', 0) === 0) {
      newDependencyVersion = '~' + newProjectVersion;
    } else if (currentDependencyVersion.lastIndexOf('^', 0) === 0) {
      newDependencyVersion = '^' + newProjectVersion;
    } else {
      newDependencyVersion = newProjectVersion;
    }
    return currentDependencySpecifier.specifierType === DependencySpecifierType.Workspace
      ? `workspace:${newDependencyVersion}`
      : newDependencyVersion;
  }

  private static _getReleaseType(changeType: ChangeType): semver.ReleaseType {
    switch (changeType) {
      case ChangeType.major:
        return 'major';
      case ChangeType.minor:
        return 'minor';
      case ChangeType.patch:
        return 'patch';
      case ChangeType.hotfix:
        return 'prerelease';
      default:
        throw new Error(`Wrong change type ${changeType}`);
    }
  }

  private static _getNewRangeDependency(newVersion: string): string {
    let upperLimit: string = newVersion;
    if (semver.prerelease(newVersion)) {
      // Remove the prerelease first, then bump major.
      upperLimit = semver.inc(newVersion, 'patch')!;
    }
    upperLimit = semver.inc(upperLimit, 'major')!;

    return `>=${newVersion} <${upperLimit}`;
  }

  private static _shouldSkipVersionBump(
    project: RushConfigurationProject,
    prereleaseToken?: PrereleaseToken,
    projectsToExclude?: Set<string>
  ): boolean {
    // Suffix does not bump up the version.
    // Excluded projects do not bump up version.
    return (
      (prereleaseToken && prereleaseToken.isSuffix) ||
      (projectsToExclude && projectsToExclude.has(project.packageName)) ||
      !project.shouldPublish
    );
  }

  private static _updateCommitDetails(git: Git, filename: string, changes: IChangeInfo[] | undefined): void {
    try {
      const gitPath: string = git.getGitPathOrThrow();
      const fileLog: string = execSync(`${gitPath} log -n 1 ${filename}`, {
        cwd: path.dirname(filename)
      }).toString();
      const author: string = fileLog.match(/Author: (.*)/)![1];
      const commit: string = fileLog.match(/commit (.*)/)![1];

      changes!.forEach((change) => {
        change.author = author;
        change.commit = commit;
      });
    } catch (e) {
      /* no-op, best effort. */
    }
  }

  private static _writePackageChanges(
    change: IChangeInfo,
    allChanges: IChangeRequests,
    allPackages: ReadonlyMap<string, RushConfigurationProject>,
    rushConfiguration: RushConfiguration,
    shouldCommit: boolean,
    prereleaseToken?: PrereleaseToken,
    projectsToExclude?: Set<string>
  ): IPackageJson {
    const project: RushConfigurationProject = allPackages.get(change.packageName)!;
    const packageJson: IPackageJson = project.packageJson;

    const shouldSkipVersionBump: boolean =
      !project.shouldPublish || (!!projectsToExclude && projectsToExclude.has(change.packageName));

    const newVersion: string = shouldSkipVersionBump
      ? packageJson.version
      : PublishUtilities._getChangeInfoNewVersion(change, prereleaseToken);

    if (!shouldSkipVersionBump) {
      // eslint-disable-next-line no-console
      console.log(
        `\n* ${shouldCommit ? 'APPLYING' : 'DRYRUN'}: ${ChangeType[change.changeType!]} update ` +
          `for ${change.packageName} to ${newVersion}`
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `\n* ${shouldCommit ? 'APPLYING' : 'DRYRUN'}: update for ${change.packageName} at ${newVersion}`
      );
    }

    const packagePath: string = path.join(project.projectFolder, FileConstants.PackageJson);

    packageJson.version = newVersion;

    // Update the package's dependencies.
    PublishUtilities._updateDependencies(
      packageJson.name,
      packageJson.dependencies,
      allChanges,
      allPackages,
      rushConfiguration,
      prereleaseToken,
      projectsToExclude
    );
    // Update the package's dev dependencies.
    PublishUtilities._updateDependencies(
      packageJson.name,
      packageJson.devDependencies,
      allChanges,
      allPackages,
      rushConfiguration,
      prereleaseToken,
      projectsToExclude
    );
    // Update the package's peer dependencies.
    PublishUtilities._updateDependencies(
      packageJson.name,
      packageJson.peerDependencies,
      allChanges,
      allPackages,
      rushConfiguration,
      prereleaseToken,
      projectsToExclude
    );

    change.changes!.forEach((subChange) => {
      if (subChange.comment) {
        // eslint-disable-next-line no-console
        console.log(` - [${ChangeType[subChange.changeType!]}] ${subChange.comment}`);
      }
    });

    if (shouldCommit) {
      JsonFile.save(packageJson, packagePath, { updateExistingFile: true });
    }
    return packageJson;
  }

  private static _isCyclicDependency(
    allPackages: ReadonlyMap<string, RushConfigurationProject>,
    packageName: string,
    dependencyName: string
  ): boolean {
    const packageConfig: RushConfigurationProject | undefined = allPackages.get(packageName);
    return !!packageConfig && packageConfig.decoupledLocalDependencies.has(dependencyName);
  }

  private static _updateDependencies(
    packageName: string,
    dependencies: { [key: string]: string } | undefined,
    allChanges: IChangeRequests,
    allPackages: ReadonlyMap<string, RushConfigurationProject>,
    rushConfiguration: RushConfiguration,
    prereleaseToken: PrereleaseToken | undefined,
    projectsToExclude?: Set<string>
  ): void {
    if (dependencies) {
      Object.keys(dependencies).forEach((depName) => {
        if (!PublishUtilities._isCyclicDependency(allPackages, packageName, depName)) {
          const depChange: IChangeInfo | undefined = allChanges.packageChanges.get(depName);
          if (!depChange) {
            return;
          }
          const depProject: RushConfigurationProject = allPackages.get(depName)!;

          if (!depProject.shouldPublish || (projectsToExclude && projectsToExclude.has(depName))) {
            // No version change.
            return;
          } else if (
            prereleaseToken &&
            prereleaseToken.hasValue &&
            prereleaseToken.isPartialPrerelease &&
            depChange.changeType! < ChangeType.hotfix
          ) {
            // For partial prereleases, do not version bump dependencies with the `prereleaseToken`
            // value unless an actual change (hotfix, patch, minor, major) has occurred
            return;
          } else if (depChange && prereleaseToken && prereleaseToken.hasValue) {
            // TODO: treat prerelease version the same as non-prerelease version.
            // For prerelease, the newVersion needs to be appended with prerelease name.
            // And dependency should specify the specific prerelease version.
            const currentSpecifier: DependencySpecifier = DependencySpecifier.parseWithCache(
              depName,
              dependencies[depName]
            );
            const newVersion: string = PublishUtilities._getChangeInfoNewVersion(depChange, prereleaseToken);
            dependencies[depName] =
              currentSpecifier.specifierType === DependencySpecifierType.Workspace
                ? `workspace:${newVersion}`
                : newVersion;
          } else if (depChange && depChange.changeType! >= ChangeType.hotfix) {
            PublishUtilities._updateDependencyVersion(
              packageName,
              dependencies,
              depName,
              depChange,
              allChanges,
              allPackages,
              rushConfiguration
            );
          }
        }
      });
    }
  }

  /**
   * Gets the new version from the ChangeInfo.
   * The value of newVersion in ChangeInfo remains unchanged when the change type is dependency,
   * However, for pre-release build, it won't pick up the updated pre-released dependencies. That is why
   * this function should return a pre-released patch for that case. The exception to this is when we're
   * running a partial pre-release build. In this case, only user-changed packages should update.
   */
  private static _getChangeInfoNewVersion(
    change: IChangeInfo,
    prereleaseToken: PrereleaseToken | undefined
  ): string {
    let newVersion: string = change.newVersion!;
    if (prereleaseToken && prereleaseToken.hasValue) {
      if (prereleaseToken.isPartialPrerelease && change.changeType! <= ChangeType.hotfix) {
        return newVersion;
      }
      if (prereleaseToken.isPrerelease && change.changeType === ChangeType.dependency) {
        newVersion = semver.inc(newVersion, 'patch')!;
      }
      return `${newVersion}-${prereleaseToken.name}`;
    } else {
      return newVersion;
    }
  }

  /**
   * Adds the given change to the packageChanges map.
   *
   * @returns true if the change caused the dependency change type to increase.
   */
  private static _addChange({
    change,
    changeFilePath,
    allChanges,
    allPackages,
    rushConfiguration,
    prereleaseToken,
    projectsToExclude
  }: IAddChangeOptions): boolean {
    let hasChanged: boolean = false;
    const packageName: string = change.packageName;
    const project: RushConfigurationProject | undefined = allPackages.get(packageName);

    if (!project) {
      // eslint-disable-next-line no-console
      console.log(
        `The package ${packageName} was requested for publishing but does not exist. Skip this change.`
      );
      return false;
    }

    const packageJson: IPackageJson = project.packageJson;

    // If the given change does not have a changeType, derive it from the "type" string.
    if (change.changeType === undefined) {
      change.changeType = Enum.tryGetValueByKey(ChangeType, change.type!);

      if (change.changeType === undefined) {
        if (changeFilePath) {
          throw new Error(`Invalid change type ${JSON.stringify(change.type)} in ${changeFilePath}`);
        } else {
          throw new InternalError(`Invalid change type ${JSON.stringify(change.type)}`);
        }
      }
    }

    let currentChange: IChangeInfo | undefined = allChanges.packageChanges.get(packageName);

    if (currentChange === undefined) {
      hasChanged = true;
      currentChange = {
        packageName,
        changeType: change.changeType,
        order: 0,
        changes: [change]
      };
      allChanges.packageChanges.set(packageName, currentChange);
    } else {
      const oldChangeType: ChangeType = currentChange.changeType!;

      if (oldChangeType === ChangeType.hotfix && change.changeType! > oldChangeType) {
        throw new Error(
          `Cannot apply ${this._getReleaseType(change.changeType!)} change after hotfix on same package`
        );
      }
      if (change.changeType! === ChangeType.hotfix && oldChangeType > change.changeType!) {
        throw new Error(
          `Cannot apply hotfix alongside ${this._getReleaseType(oldChangeType!)} change on same package`
        );
      }

      currentChange.changeType = Math.max(currentChange.changeType!, change.changeType!);
      currentChange.changes!.push(change);

      hasChanged = hasChanged || oldChangeType !== currentChange.changeType;
      hasChanged =
        hasChanged ||
        (change.newVersion !== undefined &&
          currentChange.newVersion !== undefined &&
          semver.gt(change.newVersion, currentChange.newVersion));
    }

    const skipVersionBump: boolean = PublishUtilities._shouldSkipVersionBump(
      project,
      prereleaseToken,
      projectsToExclude
    );

    if (skipVersionBump) {
      currentChange.newVersion = change.newVersion ?? packageJson.version;
      hasChanged = false;
      currentChange.changeType = ChangeType.none;
    } else {
      if (change.changeType === ChangeType.hotfix) {
        const prereleaseComponents: ReadonlyArray<string | number> | null = semver.prerelease(
          packageJson.version
        );
        if (!rushConfiguration.hotfixChangeEnabled) {
          throw new Error(`Cannot add hotfix change; hotfixChangeEnabled is false in configuration.`);
        }

        currentChange.newVersion = change.newVersion ?? (packageJson.version as string);
        if (!prereleaseComponents) {
          currentChange.newVersion += '-hotfix';
        }
        currentChange.newVersion = semver.inc(currentChange.newVersion, 'prerelease')!;
      } else {
        // When there are multiple changes of this package, the final value of new version
        // should not depend on the order of the changes.
        let packageVersion: string = change.newVersion ?? packageJson.version;
        if (currentChange.newVersion && semver.gt(currentChange.newVersion, packageVersion)) {
          packageVersion = currentChange.newVersion;
        }

        const shouldBump: boolean =
          change.newVersion === undefined && change.changeType! >= ChangeType.hotfix;

        currentChange.newVersion = shouldBump
          ? semver.inc(packageVersion, PublishUtilities._getReleaseType(currentChange.changeType!))!
          : packageVersion;

        // set versionpolicy version to the current version
        if (
          hasChanged &&
          project.versionPolicyName !== undefined &&
          project.versionPolicy !== undefined &&
          project.versionPolicy.isLockstepped
        ) {
          const projectVersionPolicy: LockStepVersionPolicy = project.versionPolicy as LockStepVersionPolicy;
          const currentVersionPolicyChange: IVersionPolicyChangeInfo | undefined =
            allChanges.versionPolicyChanges.get(project.versionPolicyName);
          if (
            projectVersionPolicy.nextBump === undefined &&
            (currentVersionPolicyChange === undefined ||
              semver.gt(currentChange.newVersion, currentVersionPolicyChange.newVersion))
          ) {
            allChanges.versionPolicyChanges.set(project.versionPolicyName, {
              versionPolicyName: project.versionPolicyName,
              changeType: currentChange.changeType!,
              newVersion: currentChange.newVersion
            });
          }
        }
      }

      // If hotfix change, force new range dependency to be the exact new version
      currentChange.newRangeDependency =
        change.changeType === ChangeType.hotfix
          ? currentChange.newVersion
          : PublishUtilities._getNewRangeDependency(currentChange.newVersion!);
    }
    return hasChanged;
  }

  private static _updateDownstreamDependencies(
    change: IChangeInfo,
    allChanges: IChangeRequests,
    allPackages: ReadonlyMap<string, RushConfigurationProject>,
    rushConfiguration: RushConfiguration,
    prereleaseToken: PrereleaseToken | undefined,
    projectsToExclude?: Set<string>
  ): boolean {
    let hasChanges: boolean = false;
    const packageName: string = change.packageName;
    const downstream: ReadonlySet<RushConfigurationProject> = allPackages.get(packageName)!.consumingProjects;

    // Iterate through all downstream dependencies for the package.
    if (downstream) {
      if (change.changeType! >= ChangeType.hotfix || (prereleaseToken && prereleaseToken.hasValue)) {
        for (const dependency of downstream) {
          const packageJson: IPackageJson = dependency.packageJson;

          hasChanges =
            PublishUtilities._updateDownstreamDependency(
              packageJson.name,
              packageJson.dependencies,
              change,
              allChanges,
              allPackages,
              rushConfiguration,
              prereleaseToken,
              projectsToExclude
            ) || hasChanges;

          hasChanges =
            PublishUtilities._updateDownstreamDependency(
              packageJson.name,
              packageJson.devDependencies,
              change,
              allChanges,
              allPackages,
              rushConfiguration,
              prereleaseToken,
              projectsToExclude
            ) || hasChanges;
        }
      }
    }

    return hasChanges;
  }

  private static _updateDownstreamDependency(
    parentPackageName: string,
    dependencies: { [packageName: string]: string } | undefined,
    change: IChangeInfo,
    allChanges: IChangeRequests,
    allPackages: ReadonlyMap<string, RushConfigurationProject>,
    rushConfiguration: RushConfiguration,
    prereleaseToken: PrereleaseToken | undefined,
    projectsToExclude?: Set<string>
  ): boolean {
    let hasChanges: boolean = false;
    if (
      dependencies &&
      dependencies[change.packageName] &&
      !PublishUtilities._isCyclicDependency(allPackages, parentPackageName, change.packageName)
    ) {
      const requiredVersion: DependencySpecifier = DependencySpecifier.parseWithCache(
        change.packageName,
        dependencies[change.packageName]
      );
      const isWorkspaceWildcardVersion: boolean =
        requiredVersion.specifierType === DependencySpecifierType.Workspace &&
        MAGIC_SPECIFIERS.has(requiredVersion.versionSpecifier);

      const isPrerelease: boolean =
        !!prereleaseToken && prereleaseToken.hasValue && !allChanges.packageChanges.has(parentPackageName);

      // If the version range exists and has not yet been updated to this version, update it.
      if (
        isPrerelease ||
        isWorkspaceWildcardVersion ||
        requiredVersion.versionSpecifier !== change.newRangeDependency
      ) {
        let changeType: ChangeType | undefined;
        // Propagate hotfix changes to dependencies
        if (change.changeType === ChangeType.hotfix) {
          changeType = ChangeType.hotfix;
        } else {
          // Either it already satisfies the new version, or doesn't.
          // If not, the downstream dep needs to be republished.
          // The downstream dep will also need to be republished if using `workspace:*` as this will publish
          // as the exact version.
          changeType =
            !isWorkspaceWildcardVersion &&
            semver.satisfies(change.newVersion!, requiredVersion.versionSpecifier)
              ? ChangeType.dependency
              : ChangeType.patch;
        }

        hasChanges = PublishUtilities._addChange({
          change: {
            packageName: parentPackageName,
            changeType
          },
          allChanges,
          allPackages,
          rushConfiguration,
          prereleaseToken,
          projectsToExclude
        });

        if (hasChanges || isPrerelease) {
          // Only re-evaluate downstream dependencies if updating the parent package's dependency
          // caused a version bump.
          hasChanges =
            PublishUtilities._updateDownstreamDependencies(
              allChanges.packageChanges.get(parentPackageName)!,
              allChanges,
              allPackages,
              rushConfiguration,
              prereleaseToken,
              projectsToExclude
            ) || hasChanges;
        }
      }
    }

    return hasChanges;
  }

  private static _getPublishDependencyVersion(specifier: DependencySpecifier, newVersion: string): string {
    if (specifier.specifierType === DependencySpecifierType.Workspace) {
      const { versionSpecifier } = specifier;
      switch (versionSpecifier) {
        case '*':
          return newVersion;
        case '~':
        case '^':
          return `${versionSpecifier}${newVersion}`;
      }
    }
    return newVersion;
  }

  private static _updateDependencyVersion(
    packageName: string,
    dependencies: { [key: string]: string },
    dependencyName: string,
    dependencyChange: IChangeInfo,
    allChanges: IChangeRequests,
    allPackages: ReadonlyMap<string, RushConfigurationProject>,
    rushConfiguration: RushConfiguration
  ): void {
    let currentDependencyVersion: string | undefined = dependencies[dependencyName];
    let newDependencyVersion: string = PublishUtilities.getNewDependencyVersion(
      dependencies,
      dependencyName,
      dependencyChange.newVersion!
    );
    dependencies[dependencyName] = newDependencyVersion;

    // "*", "~", and "^" are special cases for workspace ranges, since it will publish using the exact
    // version of the local dependency, so we need to modify what we write for our change
    // comment
    const currentDependencySpecifier: DependencySpecifier = DependencySpecifier.parseWithCache(
      dependencyName,
      currentDependencyVersion
    );
    currentDependencyVersion =
      currentDependencySpecifier.specifierType === DependencySpecifierType.Workspace &&
      MAGIC_SPECIFIERS.has(currentDependencySpecifier.versionSpecifier)
        ? undefined
        : currentDependencySpecifier.versionSpecifier;

    const newDependencySpecifier: DependencySpecifier = DependencySpecifier.parseWithCache(
      dependencyName,
      newDependencyVersion
    );
    newDependencyVersion = PublishUtilities._getPublishDependencyVersion(
      newDependencySpecifier,
      dependencyChange.newVersion!
    );

    // Add dependency version update comment.
    PublishUtilities._addChange({
      change: {
        packageName: packageName,
        changeType: ChangeType.dependency,
        comment:
          `Updating dependency "${dependencyName}" ` +
          (currentDependencyVersion ? `from \`${currentDependencyVersion}\` ` : '') +
          `to \`${newDependencyVersion}\``
      },
      allChanges,
      allPackages,
      rushConfiguration
    });
  }
}
