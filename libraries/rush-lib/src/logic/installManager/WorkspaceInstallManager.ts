// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors/safe';
import * as path from 'path';
import * as semver from 'semver';
import { FileSystem, FileConstants, AlreadyReportedError, Async } from '@rushstack/node-core-library';

import { BaseInstallManager } from '../base/BaseInstallManager';
import type { IInstallManagerOptions } from '../base/BaseInstallManagerTypes';
import { BaseShrinkwrapFile } from '../../logic/base/BaseShrinkwrapFile';
import { DependencySpecifier, DependencySpecifierType } from '../DependencySpecifier';
import { PackageJsonEditor, DependencyType } from '../../api/PackageJsonEditor';
import { PnpmWorkspaceFile } from '../pnpm/PnpmWorkspaceFile';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConstants } from '../../logic/RushConstants';
import { Utilities } from '../../utilities/Utilities';
import { InstallHelpers } from './InstallHelpers';
import { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration';
import { RepoStateFile } from '../RepoStateFile';
import { LastLinkFlagFactory } from '../../api/LastLinkFlag';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { ShrinkwrapFileFactory } from '../ShrinkwrapFileFactory';
import { BaseProjectShrinkwrapFile } from '../base/BaseProjectShrinkwrapFile';

/**
 * This class implements common logic between "rush install" and "rush update".
 */
export class WorkspaceInstallManager extends BaseInstallManager {
  /**
   * @override
   */
  public async doInstallAsync(): Promise<void> {
    // TODO: Remove when "rush link" and "rush unlink" are deprecated
    if (this.options.noLink) {
      console.log(
        colors.red(
          'The "--no-link" option was provided but is not supported when using workspaces. Run the command again ' +
            'without specifying this argument.'
        )
      );
      throw new AlreadyReportedError();
    }

    await super.doInstallAsync();
  }

  /**
   * Regenerates the common/temp/package.json and related workspace files.
   * If shrinkwrapFile is provided, this function also validates whether it contains
   * everything we need to install and returns true if so; in all other cases,
   * the return value is false.
   *
   * @override
   */
  protected async prepareCommonTempAsync(
    shrinkwrapFile: BaseShrinkwrapFile | undefined
  ): Promise<{ shrinkwrapIsUpToDate: boolean; shrinkwrapWarnings: string[] }> {
    // Block use of the RUSH_TEMP_FOLDER environment variable
    if (EnvironmentConfiguration.rushTempFolderOverride !== undefined) {
      throw new Error(
        'The RUSH_TEMP_FOLDER environment variable is not compatible with workspace installs. If attempting ' +
          'to move the PNPM store path, see the `RUSH_PNPM_STORE_PATH` environment variable.'
      );
    }

    console.log('\n' + colors.bold('Updating workspace files in ' + this.rushConfiguration.commonTempFolder));

    const shrinkwrapWarnings: string[] = [];

    // We will start with the assumption that it's valid, and then set it to false if
    // any of the checks fail
    let shrinkwrapIsUpToDate: boolean = true;

    if (!shrinkwrapFile) {
      shrinkwrapIsUpToDate = false;
    } else {
      if (!shrinkwrapFile.isWorkspaceCompatible && !this.options.fullUpgrade) {
        console.log();
        console.log(
          colors.red(
            'The shrinkwrap file has not been updated to support workspaces. Run "rush update --full" to update ' +
              'the shrinkwrap file.'
          )
        );
        throw new AlreadyReportedError();
      }

      // If there are orphaned projects, we need to update
      const orphanedProjects: ReadonlyArray<string> = shrinkwrapFile.findOrphanedProjects(
        this.rushConfiguration
      );
      if (orphanedProjects.length > 0) {
        for (const orhpanedProject of orphanedProjects) {
          shrinkwrapWarnings.push(
            `Your ${this.rushConfiguration.shrinkwrapFilePhrase} references "${orhpanedProject}" ` +
              'which was not found in rush.json'
          );
        }
        shrinkwrapIsUpToDate = false;
      }
    }

    // If preferred versions have been updated, or if the repo-state.json is invalid,
    // we can't be certain of the state of the shrinkwrap
    const repoState: RepoStateFile = this.rushConfiguration.getRepoState(this.options.variant);
    if (!repoState.isValid) {
      shrinkwrapWarnings.push(
        `The ${RushConstants.repoStateFilename} file is invalid. There may be a merge conflict marker in the file.`
      );
      shrinkwrapIsUpToDate = false;
    } else {
      const commonVersions: CommonVersionsConfiguration = this.rushConfiguration.getCommonVersions(
        this.options.variant
      );
      if (repoState.preferredVersionsHash !== commonVersions.getPreferredVersionsHash()) {
        shrinkwrapWarnings.push(
          `Preferred versions from ${RushConstants.commonVersionsFilename} have been modified.`
        );
        shrinkwrapIsUpToDate = false;
      }
    }

    // To generate the workspace file, we will add each project to the file as we loop through and validate
    const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(
      path.join(this.rushConfiguration.commonTempFolder, 'pnpm-workspace.yaml')
    );

    // Loop through the projects and add them to the workspace file. While we're at it, also validate that
    // referenced workspace projects are valid, and check if the shrinkwrap file is already up-to-date.
    for (const rushProject of this.rushConfiguration.projects) {
      const packageJson: PackageJsonEditor = rushProject.packageJsonEditor;
      workspaceFile.addPackage(rushProject.projectFolder);

      for (const { name, version, dependencyType } of [
        ...packageJson.dependencyList,
        ...packageJson.devDependencyList
      ]) {
        // Allow the package manager to handle peer dependency resolution, since this is simply a constraint
        // enforced by the package manager. Additionally, peer dependencies are simply a version constraint
        // and do not need to be converted to workspaces protocol.
        if (dependencyType === DependencyType.Peer) {
          continue;
        }

        const dependencySpecifier: DependencySpecifier = new DependencySpecifier(name, version);

        // Is there a locally built Rush project that could satisfy this dependency?
        const referencedLocalProject: RushConfigurationProject | undefined =
          this.rushConfiguration.getProjectByName(name);

        // Validate that local projects are referenced with workspace notation. If not, and it is not a
        // cyclic dependency, then it needs to be updated to specify `workspace:*` explicitly. Currently only
        // supporting versions and version ranges for specifying a local project.
        if (
          (dependencySpecifier.specifierType === DependencySpecifierType.Version ||
            dependencySpecifier.specifierType === DependencySpecifierType.Range) &&
          referencedLocalProject &&
          !rushProject.decoupledLocalDependencies.has(name)
        ) {
          // Make sure that this version is intended to target a local package. If not, then we will fail since it
          // is not explicitly specified as a cyclic dependency.
          if (
            !semver.satisfies(
              referencedLocalProject.packageJsonEditor.version,
              dependencySpecifier.versionSpecifier
            )
          ) {
            console.log();
            console.log(
              colors.red(
                `"${rushProject.packageName}" depends on package "${name}" (${version}) which exists ` +
                  'within the workspace but cannot be fulfilled with the specified version range. Either ' +
                  'specify a valid version range, or add the package as a cyclic dependency.'
              )
            );
            throw new AlreadyReportedError();
          }

          if (!this.options.allowShrinkwrapUpdates) {
            console.log();
            console.log(
              colors.red(
                `"${rushProject.packageName}" depends on package "${name}" (${version}) which exists within ` +
                  'the workspace. Run "rush update" to update workspace references for this package.'
              )
            );
            throw new AlreadyReportedError();
          }

          if (this.options.fullUpgrade) {
            // We will update to `workspace` notation. If the version specified is a range, then use the provided range.
            // Otherwise, use `workspace:*` to ensure we're always using the workspace package.
            const workspaceRange: string =
              !!semver.validRange(dependencySpecifier.versionSpecifier) &&
              !semver.valid(dependencySpecifier.versionSpecifier)
                ? dependencySpecifier.versionSpecifier
                : '*';
            packageJson.addOrUpdateDependency(name, `workspace:${workspaceRange}`, dependencyType);
            shrinkwrapIsUpToDate = false;
            continue;
          }
        } else if (dependencySpecifier.specifierType === DependencySpecifierType.Workspace) {
          // Already specified as a local project. Allow the package manager to validate this
          continue;
        }
      }

      // Save the package.json if we modified the version references and warn that the package.json was modified
      if (packageJson.saveIfModified()) {
        console.log(
          colors.yellow(
            `"${rushProject.packageName}" depends on one or more workspace packages which did not use "workspace:" ` +
              'notation. The package.json has been modified and must be committed to source control.'
          )
        );
      }

      // Now validate that the shrinkwrap file matches what is in the package.json
      if (await shrinkwrapFile?.isWorkspaceProjectModifiedAsync(rushProject, this.options.variant)) {
        shrinkwrapWarnings.push(
          `Dependencies of project "${rushProject.packageName}" do not match the current shrinkwrap.`
        );
        shrinkwrapIsUpToDate = false;
      }
    }

    // Write the common package.json
    InstallHelpers.generateCommonPackageJson(this.rushConfiguration);

    // Save the generated workspace file. Don't update the file timestamp unless the content has changed,
    // since "rush install" will consider this timestamp
    workspaceFile.save(workspaceFile.workspaceFilename, { onlyIfChanged: true });

    return { shrinkwrapIsUpToDate, shrinkwrapWarnings };
  }

  protected canSkipInstall(lastModifiedDate: Date): boolean {
    if (!super.canSkipInstall(lastModifiedDate)) {
      return false;
    }

    const potentiallyChangedFiles: string[] = [];

    if (this.rushConfiguration.packageManager === 'pnpm') {
      // Add workspace file. This file is only modified when workspace packages change.
      const pnpmWorkspaceFilename: string = path.join(
        this.rushConfiguration.commonTempFolder,
        'pnpm-workspace.yaml'
      );

      if (FileSystem.exists(pnpmWorkspaceFilename)) {
        potentiallyChangedFiles.push(pnpmWorkspaceFilename);
      }
    }

    // Also consider timestamps for all the project node_modules folders, as well as the package.json
    // files
    // Example: [ "C:\MyRepo\projects\projectA\node_modules", "C:\MyRepo\projects\projectA\package.json" ]
    potentiallyChangedFiles.push(
      ...this.rushConfiguration.projects.map((project) => {
        return path.join(project.projectFolder, RushConstants.nodeModulesFolderName);
      }),
      ...this.rushConfiguration.projects.map((project) => {
        return path.join(project.projectFolder, FileConstants.PackageJson);
      })
    );

    // NOTE: If any of the potentiallyChangedFiles does not exist, then isFileTimestampCurrent()
    // returns false.
    return Utilities.isFileTimestampCurrent(lastModifiedDate, potentiallyChangedFiles);
  }

  /**
   * Runs "npm install" in the common folder.
   */
  protected async installAsync(cleanInstall: boolean): Promise<void> {
    // Example: "C:\MyRepo\common\temp\npm-local\node_modules\.bin\npm"
    const packageManagerFilename: string = this.rushConfiguration.packageManagerToolFilename;

    const packageManagerEnv: NodeJS.ProcessEnv = InstallHelpers.getPackageManagerEnvironment(
      this.rushConfiguration,
      this.options
    );

    const commonNodeModulesFolder: string = path.join(
      this.rushConfiguration.commonTempFolder,
      RushConstants.nodeModulesFolderName
    );

    // Is there an existing "node_modules" folder to consider?
    if (FileSystem.exists(commonNodeModulesFolder)) {
      // Should we delete the entire "node_modules" folder?
      if (cleanInstall) {
        // YES: Delete "node_modules"

        // Explain to the user why we are hosing their node_modules folder
        console.log('Deleting files from ' + commonNodeModulesFolder);

        this.installRecycler.moveFolder(commonNodeModulesFolder);

        Utilities.createFolderWithRetry(commonNodeModulesFolder);
      }
    }

    const doInstall = (options: IInstallManagerOptions): void => {
      // Run "npm install" in the common folder
      const installArgs: string[] = ['install'];
      this.pushConfigurationArgs(installArgs, options);

      console.log(
        '\n' +
          colors.bold(
            `Running "${this.rushConfiguration.packageManager} install" in` +
              ` ${this.rushConfiguration.commonTempFolder}`
          ) +
          '\n'
      );

      // If any diagnostic options were specified, then show the full command-line
      if (
        this.options.debug ||
        this.options.collectLogFile ||
        this.options.networkConcurrency ||
        this.options.onlyShrinkwrap
      ) {
        console.log(
          '\n' +
            colors.green('Invoking package manager: ') +
            FileSystem.getRealPath(packageManagerFilename) +
            ' ' +
            installArgs.join(' ') +
            '\n'
        );
      }

      Utilities.executeCommandWithRetry(
        {
          command: packageManagerFilename,
          args: installArgs,
          workingDirectory: this.rushConfiguration.commonTempFolder,
          environment: packageManagerEnv,
          suppressOutput: false
        },
        this.options.maxInstallAttempts,
        () => {
          if (this.rushConfiguration.packageManager === 'pnpm') {
            console.log(colors.yellow(`Deleting the "node_modules" folder`));
            this.installRecycler.moveFolder(commonNodeModulesFolder);

            // Leave the pnpm-store as is for the retry. This ensures that packages that have already
            // been downloaded need not be downloaded again, thereby potentially increasing the chances
            // of a subsequent successful install.

            Utilities.createFolderWithRetry(commonNodeModulesFolder);
          }
        }
      );
    };

    const { configuration: experiments } = this.rushConfiguration.experimentsConfiguration;
    if (
      this.options.allowShrinkwrapUpdates &&
      experiments.usePnpmLockfileOnlyThenFrozenLockfileForRushUpdate
    ) {
      doInstall({
        ...this.options,
        onlyShrinkwrap: true
      });

      doInstall({
        ...this.options,
        allowShrinkwrapUpdates: false
      });
    } else {
      doInstall(this.options);
    }

    // If all attempts fail we just terminate. No special handling needed.

    // Ensure that node_modules folders exist after install, since the timestamps on these folders are used
    // to determine if the install can be skipped
    const projectNodeModulesFolders: string[] = [
      path.join(this.rushConfiguration.commonTempFolder, RushConstants.nodeModulesFolderName),
      ...this.rushConfiguration.projects.map((project) => {
        return path.join(project.projectFolder, RushConstants.nodeModulesFolderName);
      })
    ];

    for (const nodeModulesFolder of projectNodeModulesFolders) {
      FileSystem.ensureFolder(nodeModulesFolder);
    }

    console.log('');
  }

  protected async postInstallAsync(): Promise<void> {
    // Grab the temp shrinkwrap, as this was the most recently completed install. It may also be
    // more up-to-date than the checked-in shrinkwrap since filtered installs are not written back.
    // Note that if there are no projects, or if we're in PNPM workspace mode and there are no
    // projects with dependencies, a lockfile won't be generated.
    const tempShrinkwrapFile: BaseShrinkwrapFile | undefined = ShrinkwrapFileFactory.getShrinkwrapFile(
      this.rushConfiguration.packageManager,
      this.rushConfiguration.pnpmOptions,
      this.rushConfiguration.tempShrinkwrapFilename
    );

    if (tempShrinkwrapFile) {
      // Write or delete all project shrinkwraps related to the install
      await Async.forEachAsync(
        this.rushConfiguration.projects,
        async (project) => {
          await tempShrinkwrapFile.getProjectShrinkwrap(project)?.updateProjectShrinkwrapAsync();
        },
        { concurrency: 10 }
      );
    } else if (
      this.rushConfiguration.packageManager === 'pnpm' &&
      this.rushConfiguration.pnpmOptions?.useWorkspaces
    ) {
      // If we're in PNPM workspace mode and PNPM didn't create a shrinkwrap file,
      // there are no dependencies. Generate empty shrinkwrap files for all projects.
      await Async.forEachAsync(
        this.rushConfiguration.projects,
        async (project) => {
          await BaseProjectShrinkwrapFile.saveEmptyProjectShrinkwrapFileAsync(project);
        },
        { concurrency: 10 }
      );
    } else {
      // This is an unexpected case
      throw new Error(
        'A shrinkwrap file does not exist after after successful installation. This probably indicates a ' +
          'bug in the package manager.'
      );
    }

    // TODO: Remove when "rush link" and "rush unlink" are deprecated
    LastLinkFlagFactory.getCommonTempFlag(this.rushConfiguration).create();
  }

  /**
   * Used when invoking the NPM tool.  Appends the common configuration options
   * to the command-line.
   */
  protected pushConfigurationArgs(args: string[], options: IInstallManagerOptions): void {
    super.pushConfigurationArgs(args, options);

    // Add workspace-specific args
    if (this.rushConfiguration.packageManager === 'pnpm') {
      args.push('--recursive');
      args.push('--link-workspace-packages', 'false');

      for (const arg of this.options.pnpmFilterArguments) {
        args.push(arg);
      }
    }
  }
}
