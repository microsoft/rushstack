// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import { FileSystem, InternalError, MapExtensions, NewlineKind } from '@rushstack/node-core-library';

import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { BaseInstallManager, IInstallManagerOptions } from '../base/BaseInstallManager';
import { BaseShrinkwrapFile } from '../../logic/base/BaseShrinkwrapFile';
import { DependencySpecifier } from '../DependencySpecifier';
import { PackageJsonEditor, DependencyType } from '../../api/PackageJsonEditor';
import { PnpmWorkspaceFile } from '../pnpm/PnpmWorkspaceFile';
import { RushConfiguration } from '../../api/RushConfiguration';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConstants } from '../../logic/RushConstants';
import { Stopwatch } from '../../utilities/Stopwatch';
import { Utilities } from '../../utilities/Utilities';
import { InstallHelpers } from './InstallHelpers';

/**
 * This class implements common logic between "rush install" and "rush update".
 */
export class WorkspaceInstallManager extends BaseInstallManager {
  public static getCommonWorkspaceKey(rushConfiguration: RushConfiguration): string {
    switch (rushConfiguration.packageManager) {
      case 'pnpm':
        return '.';
      default:
        throw new InternalError('Not implemented');
    }
  }

  /**
   * @override
   */
  public async doInstall(): Promise<void> {
    // Workspaces do not support the no-link option, so throw if this is passed
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
   * Regenerates the common/package.json and related workspace files.
   * If shrinkwrapFile is provided, this function also validates whether it contains
   * everything we need to install and returns true if so; in all other cases,
   * the return value is false.
   *
   * @override
   */
  protected async prepareAndCheckShrinkwrap(
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
      await this.createShimPnpmfile(tempPnpmFilePath);
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

    // dependency name --> version specifier
    const allExplicitPreferredVersions: Map<string, string> = this.rushConfiguration
      .getCommonVersions(this.options.variant)
      .getAllPreferredVersions();

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
          shrinkwrapWarnings.push(
            `Missing dependency "${dependency}" (${version}) required by the preferred versions from ` +
              RushConstants.commonVersionsFilename
          );
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
          (dependencySpecifier.specifierType === 'version' ||
            dependencySpecifier.specifierType === 'range') &&
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

          // We will update to `workspace:*` by default to ensure we're always using the workspace package.
          packageJson.addOrUpdateDependency(name, 'workspace:*', dependencyType);
          shrinkwrapIsUpToDate = false;
          continue;
        } else if (dependencySpecifier.specifierType === 'workspace') {
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

    const allPreferredVersions: Map<string, string> = InstallHelpers.collectPreferredVersions(
      this.rushConfiguration,
      {
        explicitPreferredVersions: allExplicitPreferredVersions,
        variant: this.options.variant
      }
    );

    // Write the common package.json
    InstallHelpers.generateCommonPackageJson(this.rushConfiguration, allPreferredVersions);

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
      const pnpmWorkspaceFilename: string = path.join(
        this.rushConfiguration.commonTempFolder,
        'pnpm-workspace.yaml'
      );

      if (FileSystem.exists(pnpmWorkspaceFilename)) {
        potentiallyChangedFiles.push();
      }
    }

    // Also consider timestamps for all the project node_modules folders.
    // Example: "C:\MyRepo\projects\projectA\node_modules"
    potentiallyChangedFiles.push(
      ...this.rushConfiguration.projects.map((x) => {
        return path.join(x.projectFolder, RushConstants.nodeModulesFolderName);
      })
    );

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
        this.options.maxInstallAttempts,
        packageManagerFilename,
        installArgs,
        this.rushConfiguration.commonTempFolder,
        packageManagerEnv,
        false,
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

  /**
   * Preferred versions are supported using pnpmfile by substituting any dependency version specifier
   * for the preferred version during package resolution. This is only done if the preferred version range
   * is a subset of the dependency version range. Allowed alternate versions are not modified. The pnpmfile
   * shim will subsequently call into the provided pnpmfile, if one exists.
   */
  protected async createShimPnpmfile(filename: string): Promise<void> {
    // Get the versions we want to add to the shim pnpmfile
    const allPreferredVersions: Map<string, string> = InstallHelpers.collectPreferredVersions(
      this.rushConfiguration,
      this.options
    );
    const allowedAlternativeVersions: Map<
      string,
      ReadonlyArray<string>
    > = this.rushConfiguration.getCommonVersions(this.options.variant).allowedAlternativeVersions;

    const clientPnpmfileName: string = 'clientPnpmfile.js';
    const pnpmfileContent: string[] = [
      '// THIS IS A GENERATED FILE. DO NOT MODIFY.',
      '"use strict";',
      'module.exports = { hooks: { readPackage, afterAllResolved } };',

      // Obtain the original pnpmfile provided by the repo, if it exists.
      'const { existsSync } = require("fs");',
      'const clientPnpmfile = ',
      `  existsSync("${clientPnpmfileName}") ? require("./${path.basename(
        clientPnpmfileName,
        '.js'
      )}") : undefined;`,
      // We will require semver from this path on disk, since this is the version of semver shipping with Rush
      `const semver = require(${JSON.stringify(require.resolve('semver'))});`,

      // Include all the preferredVersions and allowedAlternativeVersions directly since there is no need to
      // generate them on the fly
      `const allPreferredVersions = ${JSON.stringify(MapExtensions.toObject(allPreferredVersions))};`,
      `const allowedAlternativeVersions = ${JSON.stringify(
        MapExtensions.toObject(allowedAlternativeVersions)
      )};`,

      // Call the original pnpmfile (if it exists)
      'function afterAllResolved(lockfile, context) {',
      '  return (clientPnpmfile && clientPnpmfile.hooks && clientPnpmfile.hooks.afterAllResolved)',
      '    ? clientPnpmfile.hooks.afterAllResolved(lockfile, context)',
      '    : lockfile;',
      '}',

      // Set the preferred versions in the package, then call the original pnpmfile (if it exists)
      'function readPackage(pkg, context) {',
      '  setPreferredVersions(pkg.dependencies);',
      '  setPreferredVersions(pkg.devDependencies);',
      '  setPreferredVersions(pkg.optionalDependencies);',
      '  return (clientPnpmfile && clientPnpmfile.hooks && clientPnpmfile.hooks.readPackage)',
      '    ? clientPnpmfile.hooks.readPackage(pkg, context)',
      '    : pkg;',
      '}',

      // Set the preferred versions on the dependency map. If the version on the map is an allowedAlternativeVersion
      // then skip it. Otherwise, check to ensure that the common version is a subset of the specified version. If
      // it is, then replace the specified version with the preferredVersion
      'function setPreferredVersions(dependencies) {',
      '  for (const name of Object.keys(dependencies || {})) {',
      '    if (allPreferredVersions.hasOwnProperty(name)) {',
      '      const preferredVersion = allPreferredVersions[name];',
      '      const version = dependencies[name];',
      '      if (allowedAlternativeVersions.hasOwnProperty(name)) {',
      '        const allowedAlternatives = allowedAlternativeVersions[name];',
      '        if (allowedAlternatives && allowedAlternatives.indexOf(version) > -1) {',
      '          continue;',
      '        }',
      '      }',
      '      let isValidRange = false;',
      '      try {',
      '        isValidRange = !!semver.validRange(preferredVersion) && !!semver.validRange(version);',
      '      } catch {',
      '      }',
      '      if (isValidRange && semver.subset(preferredVersion, version)) {',
      '        dependencies[name] = preferredVersion;',
      '      }',
      '    }',
      '  }',
      '}'
    ];

    // Attempt to move the existing pnpmfile if there is one
    try {
      const pnpmfileDir: string = path.dirname(filename);
      await FileSystem.moveAsync({
        sourcePath: filename,
        destinationPath: path.join(pnpmfileDir, clientPnpmfileName)
      });
    } catch (error) {
      if (!FileSystem.isNotExistError(error)) {
        throw error;
      }
    }

    // Write the shim pnpmfile to the original file path
    await FileSystem.writeFileAsync(filename, pnpmfileContent.join(NewlineKind.Lf), {
      ensureFolderExists: true
    });
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
