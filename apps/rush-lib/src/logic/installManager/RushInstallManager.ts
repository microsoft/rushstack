// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as glob from 'glob';
import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import * as tar from 'tar';
import * as globEscape from 'glob-escape';
import { JsonFile, Text, FileSystem, FileConstants, Sort, PosixModeBits } from '@rushstack/node-core-library';

import { BaseInstallManager } from '../base/BaseInstallManager';
import { BaseShrinkwrapFile } from '../../logic/base/BaseShrinkwrapFile';
import { IRushTempPackageJson } from '../../logic/base/BasePackage';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConstants } from '../../logic/RushConstants';
import { Stopwatch } from '../../utilities/Stopwatch';
import { Utilities } from '../../utilities/Utilities';
import { PackageJsonEditor, DependencyType } from '../../api/PackageJsonEditor';
import { DependencySpecifier } from '../DependencySpecifier';
import { InstallHelpers } from './InstallHelpers';

/**
 * The "noMtime" flag is new in tar@4.4.1 and not available yet for \@types/tar.
 * As a temporary workaround, augment the type.
 */
declare module 'tar' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  export interface CreateOptions {
    /**
     * "Set to true to omit writing mtime values for entries. Note that this prevents using other
     * mtime-based features like tar.update or the keepNewer option with the resulting tar archive."
     */
    noMtime?: boolean;
  }
}

/**
 * This class implements common logic between "rush install" and "rush update".
 */
export class RushInstallManager extends BaseInstallManager {
  /**
   * Regenerates the common/package.json and all temp_modules projects.
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

    // Example: "C:\MyRepo\common\temp\projects"
    const tempProjectsFolder: string = path.join(
      this.rushConfiguration.commonTempFolder,
      RushConstants.rushTempProjectsFolderName
    );

    console.log(os.EOL + colors.bold('Updating temp projects in ' + tempProjectsFolder));

    Utilities.createFolderWithRetry(tempProjectsFolder);

    const shrinkwrapWarnings: string[] = [];

    // We will start with the assumption that it's valid, and then set it to false if
    // any of the checks fail
    let shrinkwrapIsUpToDate: boolean = true;

    if (!shrinkwrapFile) {
      shrinkwrapIsUpToDate = false;
    }

    // dependency name --> version specifier
    const allExplicitPreferredVersions: Map<string, string> = this.rushConfiguration
      .getCommonVersions(this.options.variant)
      .getAllPreferredVersions();

    if (shrinkwrapFile) {
      // Check any (explicitly) preferred dependencies first
      allExplicitPreferredVersions.forEach((version: string, dependency: string) => {
        const dependencySpecifier: DependencySpecifier = new DependencySpecifier(dependency, version);

        if (!shrinkwrapFile.hasCompatibleTopLevelDependency(dependencySpecifier)) {
          shrinkwrapWarnings.push(
            `Missing dependency "${dependency}" (${version}) required by the preferred versions from ` +
              RushConstants.commonVersionsFilename
          );
          shrinkwrapIsUpToDate = false;
        }
      });

      if (this._findOrphanedTempProjects(shrinkwrapFile)) {
        // If there are any orphaned projects, then "npm install" would fail because the shrinkwrap
        // contains references such as "resolved": "file:projects\\project1" that refer to nonexistent
        // file paths.
        shrinkwrapIsUpToDate = false;
      }
    }

    // dependency name --> version specifier
    const commonDependencies: Map<string, string> = InstallHelpers.collectPreferredVersions(
      this.rushConfiguration,
      {
        explicitPreferredVersions: allExplicitPreferredVersions,
        variant: this.options.variant
      }
    );

    // To make the common/package.json file more readable, sort alphabetically
    // according to rushProject.tempProjectName instead of packageName.
    const sortedRushProjects: RushConfigurationProject[] = this.rushConfiguration.projects.slice(0);
    Sort.sortBy(sortedRushProjects, (x) => x.tempProjectName);

    for (const rushProject of sortedRushProjects) {
      const packageJson: PackageJsonEditor = rushProject.packageJsonEditor;

      // Example: "C:\MyRepo\common\temp\projects\my-project-2.tgz"
      const tarballFile: string = this._getTarballFilePath(rushProject);

      // Example: dependencies["@rush-temp/my-project-2"] = "file:./projects/my-project-2.tgz"
      commonDependencies[
        rushProject.tempProjectName
      ] = `file:./${RushConstants.rushTempProjectsFolderName}/${rushProject.unscopedTempProjectName}.tgz`;

      const tempPackageJson: IRushTempPackageJson = {
        name: rushProject.tempProjectName,
        version: '0.0.0',
        private: true,
        dependencies: {}
      };

      // Collect pairs of (packageName, packageVersion) to be added as dependencies of the @rush-temp package.json
      const tempDependencies: Map<string, string> = new Map<string, string>();

      // These can be regular, optional, or peer dependencies (but NOT dev dependencies).
      // (A given packageName will never appear more than once in this list.)
      for (const dependency of packageJson.dependencyList) {
        // If there are any optional dependencies, copy directly into the optionalDependencies field.
        if (dependency.dependencyType === DependencyType.Optional) {
          if (!tempPackageJson.optionalDependencies) {
            tempPackageJson.optionalDependencies = {};
          }
          tempPackageJson.optionalDependencies[dependency.name] = dependency.version;
        } else {
          tempDependencies.set(dependency.name, dependency.version);
        }
      }

      for (const dependency of packageJson.devDependencyList) {
        // If there are devDependencies, we need to merge them with the regular dependencies.  If the same
        // library appears in both places, then the dev dependency wins (because presumably it's saying what you
        // want right now for development, not the range that you support for consumers).
        tempDependencies.set(dependency.name, dependency.version);
      }
      Sort.sortMapKeys(tempDependencies);

      for (const [packageName, packageVersion] of tempDependencies.entries()) {
        const dependencySpecifier: DependencySpecifier = new DependencySpecifier(packageName, packageVersion);

        // Is there a locally built Rush project that could satisfy this dependency?
        // If so, then we will symlink to the project folder rather than to common/temp/node_modules.
        // In this case, we don't want "npm install" to process this package, but we do need
        // to record this decision for "rush link" later, so we add it to a special 'rushDependencies' field.
        const localProject: RushConfigurationProject | undefined = this.rushConfiguration.getProjectByName(
          packageName
        );

        if (localProject) {
          // Don't locally link if it's listed in the cyclicDependencyProjects
          if (!rushProject.cyclicDependencyProjects.has(packageName)) {
            // Also, don't locally link if the SemVer doesn't match
            const localProjectVersion: string = localProject.packageJsonEditor.version;
            if (semver.satisfies(localProjectVersion, packageVersion)) {
              // We will locally link this package, so instead add it to our special "rushDependencies"
              // field in the package.json file.
              if (!tempPackageJson.rushDependencies) {
                tempPackageJson.rushDependencies = {};
              }
              tempPackageJson.rushDependencies[packageName] = packageVersion;
              continue;
            }
          }
        }

        // We will NOT locally link this package; add it as a regular dependency.
        tempPackageJson.dependencies![packageName] = packageVersion;

        let tryReusingPackageVersionsFromShrinkwrap: boolean = true;

        if (this.rushConfiguration.packageManager === 'pnpm') {
          // Shrinkwrap churn optimization doesn't make sense when --frozen-lockfile is true
          tryReusingPackageVersionsFromShrinkwrap = !this.rushConfiguration.experimentsConfiguration
            .configuration.usePnpmFrozenLockfileForRushInstall;
        }

        if (shrinkwrapFile) {
          if (
            !shrinkwrapFile.tryEnsureCompatibleDependency(
              dependencySpecifier,
              rushProject.tempProjectName,
              tryReusingPackageVersionsFromShrinkwrap
            )
          ) {
            shrinkwrapWarnings.push(
              `Missing dependency "${packageName}" (${packageVersion}) required by "${rushProject.packageName}"`
            );
            shrinkwrapIsUpToDate = false;
          }
        }
      }

      // Example: "C:\MyRepo\common\temp\projects\my-project-2"
      const tempProjectFolder: string = this._getTempProjectFolder(rushProject);

      // Example: "C:\MyRepo\common\temp\projects\my-project-2\package.json"
      const tempPackageJsonFilename: string = path.join(tempProjectFolder, FileConstants.PackageJson);

      // we only want to overwrite the package if the existing tarball's package.json is different from tempPackageJson
      let shouldOverwrite: boolean = true;
      try {
        // if the tarball and the temp file still exist, then compare the contents
        if (FileSystem.exists(tarballFile) && FileSystem.exists(tempPackageJsonFilename)) {
          // compare the extracted package.json with the one we are about to write
          const oldBuffer: Buffer = FileSystem.readFileToBuffer(tempPackageJsonFilename);
          const newBuffer: Buffer = Buffer.from(JsonFile.stringify(tempPackageJson));

          if (Buffer.compare(oldBuffer, newBuffer) === 0) {
            shouldOverwrite = false;
          }
        }
      } catch (error) {
        // ignore the error, we will go ahead and create a new tarball
      }

      if (shouldOverwrite) {
        try {
          // ensure the folder we are about to zip exists
          Utilities.createFolderWithRetry(tempProjectFolder);

          // remove the old tarball & old temp package json, this is for any cases where new tarball creation
          // fails, and the shouldOverwrite logic is messed up because the my-project-2\package.json
          // exists and is updated, but the tarball is not accurate
          FileSystem.deleteFile(tarballFile);
          FileSystem.deleteFile(tempPackageJsonFilename);

          // write the expected package.json file into the zip staging folder
          JsonFile.save(tempPackageJson, tempPackageJsonFilename);

          // Delete the existing tarball and create a new one
          this._createTempProjectTarball(rushProject);

          console.log(`Updating ${tarballFile}`);
        } catch (error) {
          console.log(colors.yellow(error));
          // delete everything in case of any error
          FileSystem.deleteFile(tarballFile);
          FileSystem.deleteFile(tempPackageJsonFilename);
        }
      }
    }

    // Write the common package.json
    InstallHelpers.generateCommonPackageJson(this.rushConfiguration, commonDependencies);

    stopwatch.stop();
    console.log(`Finished creating temporary modules (${stopwatch.toString()})`);

    return { shrinkwrapIsUpToDate, shrinkwrapWarnings };
  }

  private _getTempProjectFolder(rushProject: RushConfigurationProject): string {
    const unscopedTempProjectName: string = rushProject.unscopedTempProjectName;
    return path.join(
      this.rushConfiguration.commonTempFolder,
      RushConstants.rushTempProjectsFolderName,
      unscopedTempProjectName
    );
  }

  /**
   * Deletes the existing tarball and creates a tarball for the given rush project
   */
  private _createTempProjectTarball(rushProject: RushConfigurationProject): void {
    const tarballFile: string = this._getTarballFilePath(rushProject);
    const tempProjectFolder: string = this._getTempProjectFolder(rushProject);

    FileSystem.deleteFile(tarballFile);

    // NPM expects the root of the tarball to have a directory called 'package'
    const npmPackageFolder: string = 'package';

    const tarOptions: tar.CreateOptions = {
      gzip: true,
      file: tarballFile,
      cwd: tempProjectFolder,
      portable: true,
      noMtime: true,
      noPax: true,
      sync: true,
      prefix: npmPackageFolder,
      filter: (path: string, stat: tar.FileStat): boolean => {
        if (
          !this.rushConfiguration.experimentsConfiguration.configuration.noChmodFieldInTarHeaderNormalization
        ) {
          stat.mode =
            // eslint-disable-next-line no-bitwise
            (stat.mode & ~0x1ff) | PosixModeBits.AllRead | PosixModeBits.UserWrite | PosixModeBits.AllExecute;
        }
        return true;
      }
    } as tar.CreateOptions;
    // create the new tarball
    tar.create(tarOptions, [FileConstants.PackageJson]);
  }

  /**
   * Check whether or not the install is already valid, and therefore can be skipped.
   *
   * @override
   */
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
    }

    // Also consider timestamps for all the temp tarballs. (createTempModulesAndCheckShrinkwrap() will
    // carefully preserve these timestamps unless something has changed.)
    // Example: "C:\MyRepo\common\temp\projects\my-project-2.tgz"
    potentiallyChangedFiles.push(
      ...this.rushConfiguration.projects.map((x) => {
        return this._getTarballFilePath(x);
      })
    );

    return Utilities.isFileTimestampCurrent(lastModifiedDate, potentiallyChangedFiles);
  }

  /**
   * Runs "npm/pnpm/yarn install" in the "common/temp" folder.
   *
   * @override
   */
  protected async install(cleanInstall: boolean): Promise<void> {
    // Since we are actually running npm/pnpm/yarn install, recreate all the temp project tarballs.
    // This ensures that any existing tarballs with older header bits will be regenerated.
    // It is safe to assume that temp project pacakge.jsons already exist.
    for (const rushProject of this.rushConfiguration.projects) {
      this._createTempProjectTarball(rushProject);
    }

    // NOTE: The PNPM store is supposed to be transactionally safe, so we don't delete it automatically.
    // The user must request that via the command line.
    if (cleanInstall) {
      if (this.rushConfiguration.packageManager === 'npm') {
        console.log(`Deleting the "npm-cache" folder`);
        // This is faster and more thorough than "npm cache clean"
        this.installRecycler.moveFolder(this.rushConfiguration.npmCacheFolder);

        console.log(`Deleting the "npm-tmp" folder`);
        this.installRecycler.moveFolder(this.rushConfiguration.npmTmpFolder);
      }
    }

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
      } else {
        // NO: Prepare to do an incremental install in the "node_modules" folder

        // note: it is not necessary to run "prune" with pnpm
        if (this.rushConfiguration.packageManager === 'npm') {
          console.log(
            `Running "${this.rushConfiguration.packageManager} prune"` +
              ` in ${this.rushConfiguration.commonTempFolder}`
          );
          const args: string[] = ['prune'];
          this.pushConfigurationArgs(args, this.options);

          Utilities.executeCommandWithRetry(
            this.options.maxInstallAttempts,
            packageManagerFilename,
            args,
            this.rushConfiguration.commonTempFolder,
            packageManagerEnv
          );

          // Delete the (installed image of) the temp projects, since "npm install" does not
          // detect changes for "file:./" references.
          // We recognize the temp projects by their names, which always start with "rush-".

          // Example: "C:\MyRepo\common\temp\node_modules\@rush-temp"
          const pathToDeleteWithoutStar: string = path.join(
            commonNodeModulesFolder,
            RushConstants.rushTempNpmScope
          );
          console.log(`Deleting ${pathToDeleteWithoutStar}\\*`);
          // Glob can't handle Windows paths
          const normalizedpathToDeleteWithoutStar: string = Text.replaceAll(
            pathToDeleteWithoutStar,
            '\\',
            '/'
          );

          // Example: "C:/MyRepo/common/temp/node_modules/@rush-temp/*"
          for (const tempModulePath of glob.sync(globEscape(normalizedpathToDeleteWithoutStar) + '/*')) {
            // We could potentially use AsyncRecycler here, but in practice these folders tend
            // to be very small
            Utilities.dangerouslyDeletePath(tempModulePath);
          }
        }
      }
    }

    if (this.rushConfiguration.packageManager === 'yarn') {
      // Yarn does not correctly detect changes to a tarball, so we need to forcibly clear its cache
      const yarnRushTempCacheFolder: string = path.join(
        this.rushConfiguration.yarnCacheFolder,
        'v2',
        'npm-@rush-temp'
      );
      if (FileSystem.exists(yarnRushTempCacheFolder)) {
        console.log('Deleting ' + yarnRushTempCacheFolder);
        Utilities.dangerouslyDeletePath(yarnRushTempCacheFolder);
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

    if (this.rushConfiguration.packageManager === 'npm') {
      console.log(os.EOL + colors.bold('Running "npm shrinkwrap"...'));
      const npmArgs: string[] = ['shrinkwrap'];
      this.pushConfigurationArgs(npmArgs, this.options);
      Utilities.executeCommand(
        this.rushConfiguration.packageManagerToolFilename,
        npmArgs,
        this.rushConfiguration.commonTempFolder
      );
      console.log('"npm shrinkwrap" completed' + os.EOL);

      this._fixupNpm5Regression();
    }
  }

  /**
   * Gets the path to the tarball
   * Example: "C:\MyRepo\common\temp\projects\my-project-2.tgz"
   */
  private _getTarballFilePath(project: RushConfigurationProject): string {
    return path.join(
      this.rushConfiguration.commonTempFolder,
      RushConstants.rushTempProjectsFolderName,
      `${project.unscopedTempProjectName}.tgz`
    );
  }

  /**
   * This is a workaround for a bug introduced in NPM 5 (and still unfixed as of NPM 5.5.1):
   * https://github.com/npm/npm/issues/19006
   *
   * The regression is that "npm install" sets the package.json "version" field for the
   * @rush-temp projects to a value like "file:projects/example.tgz", when it should be "0.0.0".
   * This causes "rush link" to fail later, when read-package-tree tries to parse the bad version.
   * The error looks like this:
   *
   * ERROR: Failed to parse package.json for foo: Invalid version: "file:projects/example.tgz"
   *
   * Our workaround is to rewrite the package.json files for each of the @rush-temp projects
   * in the node_modules folder, after "npm install" completes.
   */
  private _fixupNpm5Regression(): void {
    const pathToDeleteWithoutStar: string = path.join(
      this.rushConfiguration.commonTempFolder,
      'node_modules',
      RushConstants.rushTempNpmScope
    );
    // Glob can't handle Windows paths
    const normalizedPathToDeleteWithoutStar: string = Text.replaceAll(pathToDeleteWithoutStar, '\\', '/');

    let anyChanges: boolean = false;

    // Example: "C:/MyRepo/common/temp/node_modules/@rush-temp/*/package.json"
    for (const packageJsonPath of glob.sync(
      globEscape(normalizedPathToDeleteWithoutStar) + '/*/package.json'
    )) {
      // Example: "C:/MyRepo/common/temp/node_modules/@rush-temp/example/package.json"
      const packageJsonObject: IRushTempPackageJson = JsonFile.load(packageJsonPath);

      // The temp projects always use "0.0.0" as their version
      packageJsonObject.version = '0.0.0';

      if (JsonFile.save(packageJsonObject, packageJsonPath, { onlyIfChanged: true })) {
        anyChanges = true;
      }
    }

    if (anyChanges) {
      console.log(os.EOL + colors.yellow(Utilities.wrapWords(`Applied workaround for NPM 5 bug`)) + os.EOL);
    }
  }

  /**
   * Checks for temp projects that exist in the shrinkwrap file, but don't exist
   * in rush.json.  This might occur, e.g. if a project was recently deleted or renamed.
   *
   * @returns true if orphans were found, or false if everything is okay
   */
  private _findOrphanedTempProjects(shrinkwrapFile: BaseShrinkwrapFile): boolean {
    // We can recognize temp projects because they are under the "@rush-temp" NPM scope.
    for (const tempProjectName of shrinkwrapFile.getTempProjectNames()) {
      if (!this.rushConfiguration.findProjectByTempName(tempProjectName)) {
        console.log(
          os.EOL +
            colors.yellow(
              Utilities.wrapWords(
                `Your ${this.rushConfiguration.shrinkwrapFilePhrase} references a project "${tempProjectName}" which no longer exists.`
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
