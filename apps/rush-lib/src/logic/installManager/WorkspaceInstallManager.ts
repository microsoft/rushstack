// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import {
  FileSystem,
  InternalError,
  MapExtensions,
  JsonFile,
  FileConstants
} from '@rushstack/node-core-library';

import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { BaseInstallManager, IInstallManagerOptions } from '../base/BaseInstallManager';
import { BaseShrinkwrapFile } from '../../logic/base/BaseShrinkwrapFile';
import { DependencySpecifier, DependencySpecifierType } from '../DependencySpecifier';
import { PackageJsonEditor, DependencyType, PackageJsonDependency } from '../../api/PackageJsonEditor';
import { PnpmWorkspaceFile } from '../pnpm/PnpmWorkspaceFile';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConstants } from '../../logic/RushConstants';
import { Stopwatch } from '../../utilities/Stopwatch';
import { Utilities } from '../../utilities/Utilities';
import { InstallHelpers } from './InstallHelpers';
import { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration';
import { RepoStateFile } from '../RepoStateFile';
import { IPnpmfileShimSettings } from '../pnpm/IPnpmfileShimSettings';
import { PnpmProjectDependencyManifest } from '../pnpm/PnpmProjectDependencyManifest';
import { PnpmShrinkwrapFile, IPnpmShrinkwrapImporterYaml } from '../pnpm/PnpmShrinkwrapFile';
import { LastLinkFlag } from '../../api/LastLinkFlag';

/**
 * This class implements common logic between "rush install" and "rush update".
 */
export class WorkspaceInstallManager extends BaseInstallManager {
  /**
   * @override
   */
  public async doInstall(): Promise<void> {
    // TODO: Remove when "rush link" and "rush unlink" are deprecated
    if (this.options.noLink) {
      console.log();
      console.log(
        colors.red(
          'The "--no-link" option was provided but is not supported when using workspaces. Run the command again ' +
            'without specifying this argument.'
        )
      );
      throw new AlreadyReportedError();
    }

    await super.doInstall();
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
    const stopwatch: Stopwatch = Stopwatch.start();

    console.log(
      os.EOL + colors.bold('Updating workspace files in ' + this.rushConfiguration.commonTempFolder)
    );

    // Shim support for common versions resolution into the pnpmfile. When using workspaces, there are no
    // "hoisted" packages, so we need to apply the correct versions to indirect dependencies through the
    // pnpmfile.
    if (this.rushConfiguration.packageManager === 'pnpm') {
      const tempPnpmFilePath: string = path.join(
        this.rushConfiguration.commonTempFolder,
        RushConstants.pnpmfileFilename
      );
      await this.createShimPnpmfileAsync(tempPnpmFilePath);
    }

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
        console.log(
          colors.red(
            'The shrinkwrap file has not been updated to support workspaces. Run "rush update --full" to update ' +
              'the shrinkwrap file.'
          )
        );
        throw new AlreadyReportedError();
      }
    }

    if (shrinkwrapFile) {
      if (this._findOrphanedWorkspaceProjects(shrinkwrapFile)) {
        // If there are any orphaned projects, then install would fail because the shrinkwrap
        // contains references that refer to nonexistent file paths.
        shrinkwrapIsUpToDate = false;
      }
    }

    // If preferred versions have been updated, then we can't be certain of the state of the shrinkwrap
    const repoState: RepoStateFile = this.rushConfiguration.getRepoState(this.options.variant);
    const commonVersions: CommonVersionsConfiguration = this.rushConfiguration.getCommonVersions(
      this.options.variant
    );
    if (repoState.preferredVersionsHash !== commonVersions.getPreferredVersionsHash()) {
      shrinkwrapWarnings.push(
        `Preferred versions from ${RushConstants.commonVersionsFilename} have been modified.`
      );
      shrinkwrapIsUpToDate = false;
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
        const dependencySpecifier: DependencySpecifier = new DependencySpecifier(name, version);

        // Is there a locally built Rush project that could satisfy this dependency?
        const referencedLocalProject:
          | RushConfigurationProject
          | undefined = this.rushConfiguration.getProjectByName(name);

        // Validate that local projects are referenced with workspace notation. If not, and it is not a
        // cyclic dependency, then it needs to be updated to specify `workspace:*` explicitly. Currently only
        // supporting versions and version ranges for specifying a local project.
        if (
          (dependencySpecifier.specifierType === DependencySpecifierType.Version ||
            dependencySpecifier.specifierType === DependencySpecifierType.Range) &&
          referencedLocalProject &&
          !rushProject.cyclicDependencyProjects.has(name)
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

        // Allow the package manager to handle peer dependency resolution, since this is simply a constraint
        // enforced by the package manager
        if (dependencyType === DependencyType.Peer) {
          continue;
        }

        // It is not a local dependency, validate that it is compatible
        if (
          shrinkwrapFile &&
          !shrinkwrapFile.hasCompatibleWorkspaceDependency(
            dependencySpecifier,
            shrinkwrapFile.getWorkspaceKeyByPath(
              this.rushConfiguration.commonTempFolder,
              rushProject.projectFolder
            )
          )
        ) {
          shrinkwrapWarnings.push(
            `Missing dependency "${name}" (${version}) required by "${rushProject.packageName}"`
          );
          shrinkwrapIsUpToDate = false;
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
    }

    // Write the common package.json
    InstallHelpers.generateCommonPackageJson(this.rushConfiguration);

    // Save the generated workspace file. Don't update the file timestamp unless the content has changed,
    // since "rush install" will consider this timestamp
    workspaceFile.save(workspaceFile.workspaceFilename, { onlyIfChanged: true });

    stopwatch.stop();
    console.log(`Finished creating workspace (${stopwatch.toString()})`);

    return { shrinkwrapIsUpToDate, shrinkwrapWarnings };
  }

  protected canSkipInstall(lastModifiedDate: Date): boolean {
    console.log(
      os.EOL +
        colors.bold(
          `Checking ${RushConstants.nodeModulesFolderName} in ${this.rushConfiguration.commonTempFolder}`
        ) +
        os.EOL
    );

    // Based on timestamps, can we skip this install entirely?
    const potentiallyChangedFiles: string[] = [];

    // Consider the timestamp on the node_modules folder; if someone tampered with it
    // or deleted it entirely, then we can't skip this install
    potentiallyChangedFiles.push(
      path.join(this.rushConfiguration.commonTempFolder, RushConstants.nodeModulesFolderName)
    );

    // Additionally, if they pulled an updated shrinkwrap file from Git, then we can't skip this install
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
      const pnpmWorkspaceFilename: string = path.join(
        this.rushConfiguration.commonTempFolder,
        'pnpm-workspace.yaml'
      );

      if (FileSystem.exists(pnpmWorkspaceFilename)) {
        potentiallyChangedFiles.push();
      }
    }

    // Also consider timestamps for all the project node_modules folders, as well as the package.json
    // files
    // Example: [ "C:\MyRepo\projects\projectA\node_modules", "C:\MyRepo\projects\projectA\package.json" ]
    potentiallyChangedFiles.push(
      ...this.rushConfiguration.projects.map((x) => {
        return path.join(x.projectFolder, RushConstants.nodeModulesFolderName);
      }),
      ...this.rushConfiguration.projects.map((x) => {
        return path.join(x.projectFolder, FileConstants.PackageJson);
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

    // Run "npm install" in the common folder
    const installArgs: string[] = ['install'];
    this.pushConfigurationArgs(installArgs, this.options);

    console.log(
      os.EOL +
        colors.bold(
          `Running "${this.rushConfiguration.packageManager} install" in` +
            ` ${this.rushConfiguration.commonTempFolder}`
        ) +
        os.EOL
    );

    // If any diagnostic options were specified, then show the full command-line
    if (this.options.debug || this.options.collectLogFile || this.options.networkConcurrency) {
      console.log(
        os.EOL +
          colors.green('Invoking package manager: ') +
          FileSystem.getRealPath(packageManagerFilename) +
          ' ' +
          installArgs.join(' ') +
          os.EOL
      );
    }

    try {
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

      // Ensure that node_modules folders exist after install, since the timestamps on these folders are used
      // to determine if the install can be skipped
      const projectNodeModulesFolders: string[] = [
        path.join(this.rushConfiguration.commonTempFolder, RushConstants.nodeModulesFolderName),
        ...this.rushConfiguration.projects.map((x) => {
          return path.join(x.projectFolder, RushConstants.nodeModulesFolderName);
        })
      ];

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

  protected async postInstallAsync(): Promise<void> {
    // Per-project manifests can only be generated for PNPM currently
    if (this.rushConfiguration.packageManager === 'pnpm' && this.rushConfiguration.pnpmOptions) {
      // Base it off the temp shrinkwrap, as this was the most recently completed install
      const tempShrinkwrapFile: PnpmShrinkwrapFile = PnpmShrinkwrapFile.loadFromFile(
        this.rushConfiguration.tempShrinkwrapFilename,
        this.rushConfiguration.pnpmOptions
      )!;

      await Promise.all(
        this.rushConfiguration.projects.map((x) => this._createPerProjectManifestAsync(tempShrinkwrapFile, x))
      );
    }

    // TODO: Remove when "rush link" and "rush unlink" are deprecated
    LastLinkFlag.getCommonTempFlag(this.rushConfiguration).create();
  }

  /**
   * Preferred versions are supported using pnpmfile by substituting any dependency version specifier
   * for the preferred version during package resolution. This is only done if the preferred version range
   * is a subset of the dependency version range. Allowed alternate versions are not modified. The pnpmfile
   * shim will subsequently call into the provided pnpmfile, if one exists.
   */
  protected async createShimPnpmfileAsync(filename: string): Promise<void> {
    const pnpmfileDir: string = path.dirname(filename);
    let pnpmfileExists: boolean = false;
    try {
      // Attempt to move the existing pnpmfile if there is one
      await FileSystem.moveAsync({
        sourcePath: filename,
        destinationPath: path.join(pnpmfileDir, 'clientPnpmfile.js')
      });
      pnpmfileExists = true;
    } catch (error) {
      if (!FileSystem.isNotExistError(error)) {
        throw error;
      }
    }

    const pnpmfileShimSettings: IPnpmfileShimSettings = {
      allPreferredVersions: MapExtensions.toObject(
        InstallHelpers.collectPreferredVersions(this.rushConfiguration, this.options)
      ),
      allowedAlternativeVersions: MapExtensions.toObject(
        this.rushConfiguration.getCommonVersions(this.options.variant).allowedAlternativeVersions
      ),
      semverPath: require.resolve('semver'),
      useClientPnpmfile: pnpmfileExists
    };

    // Write the settings to be consumed by the pnpmfile
    await JsonFile.saveAsync(pnpmfileShimSettings, path.resolve(pnpmfileDir, 'pnpmfileSettings.json'), {
      ensureFolderExists: true
    });

    // Copy the shim pnpmfile to the original path
    await FileSystem.copyFileAsync({
      sourcePath: path.resolve(__dirname, '..', 'pnpm', 'PnpmfileShim.js'),
      destinationPath: filename
    });
  }

  protected _createPerProjectManifestAsync(
    pnpmShrinkwrapFile: PnpmShrinkwrapFile,
    project: RushConfigurationProject
  ): Promise<void> {
    const pnpmProjectDependencyManifest: PnpmProjectDependencyManifest = new PnpmProjectDependencyManifest({
      pnpmShrinkwrapFile,
      project
    });

    // If the feature is not enabled, clean up the manifest and return
    if (
      this.rushConfiguration.experimentsConfiguration.configuration.legacyIncrementalBuildDependencyDetection
    ) {
      return pnpmProjectDependencyManifest.deleteIfExistsAsync();
    }

    // Obtain the workspace importer from the shrinkwrap, which lists resolved dependencies
    const importerKey: string = pnpmShrinkwrapFile.getWorkspaceKeyByPath(
      this.rushConfiguration.commonTempFolder,
      project.projectFolder
    );
    const workspaceImporter:
      | IPnpmShrinkwrapImporterYaml
      | undefined = pnpmShrinkwrapFile.getWorkspaceImporter(importerKey);

    if (!workspaceImporter) {
      // Filtered installs will not contain all projects in the shrinkwrap, but if one is
      // missing during a full install, something has gone wrong
      if (this.options.toProjects.length === 0) {
        throw new InternalError(
          `Cannot find shrinkwrap entry using importer key for workspace project: ${importerKey}`
        );
      }
      return pnpmProjectDependencyManifest.deleteIfExistsAsync();
    }

    const localDependencyProjectNames: Set<string> = new Set<string>(
      project.localDependencyProjects.map((x) => x.packageName)
    );

    // Loop through non-local dependencies. Skip peer dependencies because they're only a constraint
    const dependencies: PackageJsonDependency[] = [
      ...project.packageJsonEditor.dependencyList,
      ...project.packageJsonEditor.devDependencyList
    ].filter((x) => x.dependencyType !== DependencyType.Peer && !localDependencyProjectNames.has(x.name));

    for (const { name, dependencyType } of dependencies) {
      // read the version number from the shrinkwrap entry
      let version: string | undefined;
      if (dependencyType === DependencyType.Regular) {
        version = (workspaceImporter.dependencies || {})[name];
      } else if (dependencyType === DependencyType.Dev) {
        // Dev dependencies are folded into dependencies if there is a duplicate
        // definition, so we should also check there
        version =
          (workspaceImporter.devDependencies || {})[name] || (workspaceImporter.dependencies || {})[name];
      } else if (dependencyType === DependencyType.Optional) {
        version = (workspaceImporter.optionalDependencies || {})[name];
      }

      if (!version) {
        // Optional dependencies by definition may not exist, so avoid throwing on these
        if (dependencyType !== DependencyType.Optional) {
          throw new InternalError(
            `Cannot find shrinkwrap entry dependency "${name}" for workspace project: ${project.packageName}`
          );
        }
        continue;
      }

      // Add to the manifest and provide all the parent dependencies
      pnpmProjectDependencyManifest.addDependency(name, version, {
        dependencies: { ...workspaceImporter.dependencies, ...workspaceImporter.devDependencies },
        optionalDependencies: { ...workspaceImporter.optionalDependencies },
        peerDependencies: {}
      });
    }

    return pnpmProjectDependencyManifest.saveAsync();
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

      // "<package>..." selects the specified package and all direct and indirect dependencies
      for (const toProject of this.options.toProjects) {
        args.push('--filter', `${toProject.packageName}...`);
      }
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
        console.log(
          os.EOL +
            colors.yellow(
              Utilities.wrapWords(
                `Your ${this.rushConfiguration.shrinkwrapFilePhrase} references a project at "${rushProjectPath}" ` +
                  'which no longer exists.'
              )
            ) +
            os.EOL
        );
        return true; // found one
      }
    }

    return false; // none found
  }
}
