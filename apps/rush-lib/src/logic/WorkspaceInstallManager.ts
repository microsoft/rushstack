// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint max-lines: off */

import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import {
  JsonFile,
  IPackageJson,
  FileSystem,
  FileConstants,
  InternalError
} from '@rushstack/node-core-library';

import { AlreadyReportedError } from '../utilities/AlreadyReportedError';
import { BaseInstallManager, IInstallManagerOptions } from './base/BaseInstallManager';
import { BaseShrinkwrapFile } from '../logic/base/BaseShrinkwrapFile';
import { DependencySpecifier } from './DependencySpecifier';
import { PackageJsonEditor, DependencyType } from '../api/PackageJsonEditor';
import { PnpmWorkspaceFile } from './pnpm/PnpmWorkspaceFile';
import { PurgeManager } from './PurgeManager';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';;
import { RushGlobalFolder } from '../api/RushGlobalFolder';
import { Stopwatch } from '../utilities/Stopwatch';
import { Utilities } from '../utilities/Utilities';

/**
 * This class implements common logic between "rush install" and "rush update".
 */
export class WorkspaceInstallManager extends BaseInstallManager {

  public constructor(
    rushConfiguration: RushConfiguration,
    rushGlobalFolder: RushGlobalFolder,
    purgeManager: PurgeManager,
    options: IInstallManagerOptions
  ) {
    super(rushConfiguration, rushGlobalFolder, purgeManager, options);
  }

  public static getCommonWorkspaceKey(rushConfiguration: RushConfiguration): string {
    switch (rushConfiguration.packageManager) {
      case 'pnpm':
        return '.'
      default:
        throw new InternalError('Not implemented');
    }
  }

  public async doInstall(): Promise<void> {
    // Workspaces do not support the noLink option, so throw if this is passed
    if (this.options.noLink) {
      console.log();
      console.log(colors.red(
        'The "--no-link" option was provided but is not supported when using workspaces. Run the command again '
        + 'without specifying this argument.'
      ));
      throw new AlreadyReportedError();
    }

    await super.doInstall();
  }

  protected async prepareAndCheckShrinkwrap(
    shrinkwrapFile: BaseShrinkwrapFile | undefined
  ): Promise<{ shrinkwrapIsUpToDate: boolean, shrinkwrapWarnings: string[] }> {

    const stopwatch: Stopwatch = Stopwatch.start();

    console.log(os.EOL + colors.bold('Updating workspace files in ' + this.rushConfiguration.commonTempFolder));

    const shrinkwrapWarnings: string[] = [];

    // We will start with the assumption that it's valid, and then set it to false if
    // any of the checks fail
    let shrinkwrapIsUpToDate: boolean = true;

    if (!shrinkwrapFile) {
      shrinkwrapIsUpToDate = false;
    } else {
      if (
        shrinkwrapFile.getWorkspaceKeys().length === 0 &&
        this.rushConfiguration.projects.length !== 0 &&
        !this.options.fullUpgrade
      ) {
        console.log();
        console.log(colors.red(
          'The shrinkwrap file has not been updated to support workspaces. Run "rush update --full" to update '
          + 'the shrinkwrap file.'
        ));
        throw new AlreadyReportedError();
    }
    }

    // dependency name --> version specifier
    const allExplicitPreferredVersions: Map<string, string> =
      this.rushConfiguration.getCommonVersions(this.options.variant).getAllPreferredVersions();

    if (shrinkwrapFile) {
      // Check any (explicitly) preferred dependencies first
      allExplicitPreferredVersions.forEach((version: string, dependency: string) => {
        const dependencySpecifier: DependencySpecifier = new DependencySpecifier(dependency, version);

        // The common package.json is used to ensure common versions are installed, so look for this workspace
        // and validate that the requested dependency is specified
        if (
          !shrinkwrapFile.hasCompatibleWorkspaceDependency(
            dependencySpecifier,
            WorkspaceInstallManager.getCommonWorkspaceKey(this.rushConfiguration)
          )
        ) {
          shrinkwrapWarnings.push(`Missing dependency "${dependency}" (${version}) required by the preferred versions from `
            + RushConstants.commonVersionsFilename);
          shrinkwrapIsUpToDate = false;
        }
      });

      if (this._findOrphanedWorkspaceProjects(shrinkwrapFile)) {
        // If there are any orphaned projects, then install would fail because the shrinkwrap
        // contains references that refer to nonexistent file paths.
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
      workspaceFile.addPackage(rushProject.projectFolder);
      const packageJson: PackageJsonEditor = rushProject.packageJsonEditor;

      for (const { name, version, dependencyType } of [...packageJson.dependencyList, ...packageJson.devDependencyList]) {
        const dependencySpecifier: DependencySpecifier = new DependencySpecifier(name, version);

        // Is there a locally built Rush project that could satisfy this dependency?
        const referencedLocalProject: RushConfigurationProject | undefined = this.rushConfiguration.getProjectByName(name);

        // Validate that local projects are referenced with workspace notation. If not, and it is not a
        // cyclic dependency, then it needs to be updated to specify `workspace:*` explicitly. Currently only
        // supporting versions and version ranges for specifying a local project.
        if (
          (dependencySpecifier.specifierType === 'version' || dependencySpecifier.specifierType === 'range') &&
          referencedLocalProject &&
          !rushProject.cyclicDependencyProjects.has(name)
        ) {
          // Make sure that this version is intended to target a local package. If not, then we will fail since it
          // is not explicitly specified as a cyclic dependency.
          if (!semver.satisfies(referencedLocalProject.packageJsonEditor.version, dependencySpecifier.versionSpecifier)) {
            console.log();
            console.log(colors.red(
              `"${rushProject.packageName}" depends on package "${name}" (${version}) which exists within the workspace `
              + 'but cannot be fulfilled with the specified version range. Either specify a valid version range, or add '
              + 'the package as a cyclic dependency.'
            ));
            throw new AlreadyReportedError();
          }

          if (!this.options.allowShrinkwrapUpdates) {
            console.log();
            console.log(colors.red(
              `"${rushProject.packageName}" depends on package "${name}" (${version}) which exists within the workspace. `
              + 'Run "rush update" to update workspace references for this package.'
            ));
            throw new AlreadyReportedError();
          }

          // We will update to `workspace:*` by default to ensure we're always using the workspace package.
          packageJson.addOrUpdateDependency(name, 'workspace:*', dependencyType);
          shrinkwrapIsUpToDate = false;
          continue;
        } else if (dependencySpecifier.specifierType === 'workspace') {
          // Already specified as a local project. Allow the package manager to validate this
          continue;
          }

        // PNPM does not specify peer dependencies for workspaces in the shrinkwrap, so skip validating these
        if (this.rushConfiguration.packageManager === 'pnpm' && dependencyType === DependencyType.Peer) {
          continue;
        }

        // It is not a local dependency, validate that it is compatible
        if (
          shrinkwrapFile &&
          !shrinkwrapFile.hasCompatibleWorkspaceDependency(
            dependencySpecifier,
            shrinkwrapFile.getWorkspaceKeyByPath(this.rushConfiguration.commonTempFolder, rushProject.projectFolder)
          )
        ) {
          shrinkwrapWarnings.push(`Missing dependency "${name}" (${version}) required by "${rushProject.packageName}"`);
          shrinkwrapIsUpToDate = false;
        }
      }

      // Save the package.json if we modified the version references and warn that the package.json was modified
      if (packageJson.saveIfModified()) {
        console.log(colors.yellow(
          `"${rushProject.packageName}" depends on one or more workspace packages which did not use "workspace:" `
          + 'notation. The package.json has been modified and must be committed to source control.'
        ));
      }
    }

    // Update the common package.json to contain all preferred versions
    const commonPackageJson: IPackageJson = {
      dependencies: {},
      description: 'Temporary file generated by the Rush tool',
      name: 'rush-common',
      private: true,
      version: '0.0.0'
    };

    // dependency name --> version specifier
    const allPreferredVersions: Map<string, string> = BaseInstallManager.collectPreferredVersions(
      this.rushConfiguration,
      this.options.variant
    );

    // Add any preferred versions to the top of the commonPackageJson
    // do this in alphabetical order for simpler debugging
    for (const dependency of Array.from(allPreferredVersions.keys()).sort()) {
      commonPackageJson.dependencies![dependency] = allPreferredVersions.get(dependency)!;
    }

    // Example: "C:\MyRepo\common\temp\package.json"
    const commonPackageJsonFilename: string = path.join(
      this.rushConfiguration.commonTempFolder,
      FileConstants.PackageJson
    );

    // Save the generated files. Don't update the file timestamp unless the content has changed,
    // since "rush install" will consider this timestamp
    workspaceFile.save(workspaceFile.workspaceFilename, { onlyIfChanged: true });
    JsonFile.save(commonPackageJson, commonPackageJsonFilename, { onlyIfChanged: true });

    stopwatch.stop();
    console.log(`Finished creating workspace (${stopwatch.toString()})`);

    return { shrinkwrapIsUpToDate, shrinkwrapWarnings };
  }

  protected canSkipInstall(lastModifiedDate: Date): boolean {
    console.log(os.EOL + colors.bold('Checking workspace node_modules') + os.EOL);

    // Based on timestamps, can we skip this install entirely?
    const potentiallyChangedFiles: string[] = [];

    // Consider the timestamp on the node_modules folder; if someone tampered with it
    // or deleted it entirely, then we can't skip this install
    potentiallyChangedFiles.push(path.join(this.rushConfiguration.commonTempFolder, RushConstants.nodeModulesFolderName));

    // Additionally, if they pulled an updated npm-shrinkwrap.json file from Git,
    // then we can't skip this install
    potentiallyChangedFiles.push(this.rushConfiguration.getCommittedShrinkwrapFilename(this.options.variant));

    // Add common-versions.json file to the potentially changed files list.
    potentiallyChangedFiles.push(this.rushConfiguration.getCommonVersionsFilePath(this.options.variant));

    if (this.rushConfiguration.packageManager === 'pnpm') {
      // If the repo is using pnpmfile.js, consider that also
      const pnpmFileFilename: string = this.rushConfiguration.getPnpmfilePath(this.options.variant);

      if (FileSystem.exists(pnpmFileFilename)) {
        potentiallyChangedFiles.push(pnpmFileFilename);
      }

      // Add workspace file. This file is only modified when workspace packages change.
      potentiallyChangedFiles.push(path.join(this.rushConfiguration.commonTempFolder, 'pnpm-workspace.yaml'));
    }

    // Also consider timestamps for all the project node_modules folders.
    // Example: "C:\MyRepo\projects\projectA\node_modules"
    potentiallyChangedFiles.push(...this.rushConfiguration.projects.map(x => path.join(
      x.projectFolder, RushConstants.nodeModulesFolderName)));

    // NOTE: If any of the potentiallyChangedFiles does not exist, then isFileTimestampCurrent()
    // returns false.
    return Utilities.isFileTimestampCurrent(lastModifiedDate, potentiallyChangedFiles);
  }

  /**
   * Runs "npm install" in the common folder.
   */
  protected async install(cleanInstall: boolean): Promise<void> {
    // Example: "C:\MyRepo\common\temp\npm-local\node_modules\.bin\npm"
    const packageManagerFilename: string = this.rushConfiguration.packageManagerToolFilename;
    const packageManagerEnv: NodeJS.ProcessEnv = this.getPackageManagerEnvironment();

    const projectNodeModulesFolders: string[] = [
      path.join(this.rushConfiguration.commonTempFolder, RushConstants.nodeModulesFolderName),
      ...this.rushConfiguration.projects.map(project => {
        return path.join(project.projectFolder, RushConstants.nodeModulesFolderName)
      }),
    ];

    // Should we delete the "node_modules" folder?
    if (cleanInstall) {
      // Explain to the user why we are hosing their node_modules folder
      console.log(`Deleting files from project "${ RushConstants.nodeModulesFolderName }" folders`);
      for (const nodeModulesFolder of projectNodeModulesFolders) {
        this.installRecycler.moveFolder(nodeModulesFolder);
      }
    }

    // Run "npm install" in the common folder
    const installArgs: string[] = ['install'];
    this.pushConfigurationArgs(installArgs, this.options);

    console.log(os.EOL + colors.bold(`Running "${this.rushConfiguration.packageManager} install" in`
      + ` ${this.rushConfiguration.commonTempFolder}`) + os.EOL);

    // If any diagnostic options were specified, then show the full command-line
    if (this.options.debug || this.options.collectLogFile || this.options.networkConcurrency) {
      console.log(os.EOL + colors.green('Invoking package manager: ')
        + FileSystem.getRealPath(packageManagerFilename) + ' ' + installArgs.join(' ') + os.EOL);
    }

    try {
      Utilities.executeCommandWithRetry(
        this.options.maxInstallAttempts,
        packageManagerFilename,
        installArgs,
        this.rushConfiguration.commonTempFolder,
        packageManagerEnv,
        false,
        () => {
          if (this.rushConfiguration.packageManager === 'pnpm') {
            // Leave the pnpm-store as is for the retry. This ensures that packages that have already
            // been downloaded need not be downloaded again, thereby potentially increasing the chances
            // of a subsequent successful install. We will only remove the node_modules folders for
            // local projects
            console.log(colors.yellow(`Deleting files from project "${RushConstants.nodeModulesFolderName}" folders`));
            for (const nodeModulesFolder of projectNodeModulesFolders) {
              this.installRecycler.moveFolder(nodeModulesFolder);
            }
          }
        });

      // Ensure that node_modules folders exist after install, since the timestamps on these folders are used
      // to determine if the install can be skipped
      for (const nodeModulesFolder of projectNodeModulesFolders) {
        FileSystem.ensureFolder(nodeModulesFolder);
      }
    } catch (error) {
      // All the install attempts failed.

      if (
        this.rushConfiguration.packageManager === 'pnpm' &&
        this.rushConfiguration.pnpmOptions.pnpmStore === 'local'
      ) {
        // If the installation has failed even after the retries, then pnpm store may
        // have got into a corrupted, irrecoverable state. Delete the store so that a
        // future install can create the store afresh.
        console.log(colors.yellow(`Deleting the "pnpm-store" folder`));
        this.installRecycler.moveFolder(this.rushConfiguration.pnpmOptions.pnpmStorePath);
      }

      throw error;
    }

    console.log('');
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
    }
  }

  /**
   * Checks for projects that exist in the shrinkwrap file, but don't exist
   * in rush.json.  This might occur, e.g. if a project was recently deleted or renamed.
   *
   * @returns true if orphans were found, or false if everything is okay
   */
  private _findOrphanedWorkspaceProjects(shrinkwrapFile: BaseShrinkwrapFile): boolean {

    for (const workspaceKey of shrinkwrapFile.getWorkspaceKeys()) {

      // Look for the RushConfigurationProject using the workspace key
      let rushProjectPath: string;
      if (this.rushConfiguration.packageManager === 'pnpm') {
        // PNPM workspace keys are relative paths from the workspace root, which is the common temp folder
        rushProjectPath = path.resolve(this.rushConfiguration.commonTempFolder, workspaceKey);
      } else {
        throw new InternalError('Orphaned workspaces cannot be checked for the provided package manager');
      }

      if (!this.rushConfiguration.tryGetProjectForPath(rushProjectPath)) {
        console.log(os.EOL + colors.yellow(Utilities.wrapWords(
          `Your ${this.rushConfiguration.shrinkwrapFilePhrase} references a project at "${rushProjectPath}" `
          + 'which no longer exists.')) + os.EOL);
        return true;  // found one
      }
    }

    return false;  // none found
  }
}
