// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import * as tar from 'tar';
import encodeRegistry = require('encode-registry');
import { JsonFile } from '@microsoft/node-core-library';
import {
  RushConstants,
  RushConfiguration,
  IRushLinkJson,
  RushConfigurationProject,
  Utilities,
  Stopwatch
} from '@microsoft/rush-lib';

import Package from './Package';

enum SymlinkKind {
  File,
  Directory
}

export default class LinkManager {
  private _rushConfiguration: RushConfiguration;

  private static _createSymlink(linkTarget: string, linkSource: string, symlinkKind: SymlinkKind): void {
    fsx.mkdirsSync(path.dirname(linkSource));

    // For directories, we use a Windows "junction".  On Unix, this produces a regular symlink.
    fsx.symlinkSync(linkTarget, linkSource, 'junction');
  }

  /**
   * This is a helper function used by createSymlinksForTopLevelProject().
   * It will recursively creates symlinked folders corresponding to each of the
   * Package objects in the provided tree.
   */
  private static _createSymlinksForDependencies(localPackage: Package): void {
    const localModuleFolder: string = path.join(localPackage.folderPath, 'node_modules');

    if (!localPackage.symlinkTargetFolderPath) {
      // Program bug
      throw Error('localPackage.symlinkTargetFolderPath was not assigned');
    }

    // This is special case for when localPackage.name has the form '@scope/name',
    // in which case we need to create the '@scope' folder first.
    const parentFolderPath: string = path.dirname(localPackage.folderPath);
    if (parentFolderPath && parentFolderPath !== localPackage.folderPath) {
      if (!fsx.existsSync(parentFolderPath)) {
        Utilities.createFolderWithRetry(parentFolderPath);
      }
    }

    if (localPackage.children.length === 0) {
      // If there are no children, then we can symlink the entire folder
      LinkManager._createSymlink(localPackage.symlinkTargetFolderPath, localPackage.folderPath, SymlinkKind.Directory);
    } else {
      // If there are children, then we need to symlink each item in the folder individually
      Utilities.createFolderWithRetry(localPackage.folderPath);

      for (const filename of fsx.readdirSync(localPackage.symlinkTargetFolderPath)) {
        if (filename.toLowerCase() !== 'node_modules') {
          // Create the symlink
          let symlinkKind: SymlinkKind = SymlinkKind.File;

          const linkSource: string = path.join(localPackage.folderPath, filename);
          let linkTarget: string = path.join(localPackage.symlinkTargetFolderPath, filename);

          const linkStats: fsx.Stats = fsx.lstatSync(linkTarget);

          if (linkStats.isSymbolicLink()) {
            const targetStats: fsx.Stats = fsx.statSync(linkTarget);
            if (targetStats.isDirectory()) {
              // Neither a junction nor a directory-symlink can have a directory-symlink
              // as its target; instead, we must obtain the real physical path.
              // A junction can link to another junction.  Unfortunately, the node 'fs' API
              // lacks the ability to distinguish between a junction and a directory-symlink
              // (even though it has the ability to create them both), so the safest policy
              // is to always make a junction and always to the real physical path.
              linkTarget = fsx.realpathSync(linkTarget);
              symlinkKind = SymlinkKind.Directory;
            }
          } else if (linkStats.isDirectory()) {
            symlinkKind = SymlinkKind.Directory;
          }

          LinkManager._createSymlink(linkTarget, linkSource, symlinkKind);
        }
      }
    }

    // this should never occur
    if (localPackage.children.length > 0) {
      Utilities.createFolderWithRetry(localModuleFolder);

      for (const child of localPackage.children) {
        LinkManager._createSymlinksForDependencies(child);
      }
    }
  }

  /**
   * For a Package object that represents a top-level Rush project folder
   * (i.e. with source code that we will be building), this clears out its
   * node_modules folder and then recursively creates all the symlinked folders.
   */
  private static _createSymlinksForTopLevelProject(localPackage: Package): void {
    const localModuleFolder: string = path.join(localPackage.folderPath, 'node_modules');

    // Sanity check
    if (localPackage.parent) {
      throw new Error('The provided package is not a top-level project');
    }

    // The root-level folder is the project itself, so we simply delete its node_modules
    // to start clean
    console.log('Purging ' + localModuleFolder);
    Utilities.dangerouslyDeletePath(localModuleFolder);

    if (localPackage.children.length > 0) {
      Utilities.createFolderWithRetry(localModuleFolder);

      for (const child of localPackage.children) {
        LinkManager._createSymlinksForDependencies(child);
      }
    }
  }

  constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  /*
   * Creates node_modules symlinks for all Rush projects defined in the RushConfiguration.
   * @param force - Normally the operation will be skipped if the links are already up to date;
   *   if true, this option forces the links to be recreated.
   */
  public createSymlinksForProjects(force: boolean): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (reason: Error) => void): void => {
      if (!force) {
        if (fsx.existsSync(this._rushConfiguration.rushLinkJsonFilename)) {
          console.log(colors.green(`Skipping linking -- everything is already up to date.`));
          resolve();
          return;
        }
      }

      console.log('Linking projects together...');
      const stopwatch: Stopwatch = Stopwatch.start();

      // Delete the flag file if it exists; if we get interrupted, this will ensure that
      // a full "rush link" is required next time
      Utilities.deleteFile(this._rushConfiguration.rushLinkJsonFilename);

      // go ahead and find out the registry we are using, we need this to locate the pnpm store folder
      const registryUrl: string = Utilities.executeCommandAndCaptureOutput(
        this._rushConfiguration.pnpmToolFilename,
        ['config', 'get', 'registry'],
        this._rushConfiguration.commonTempFolder,
        process.env);

      const encodedRegistry: string = encodeRegistry(registryUrl);

      const registryPath: string = path.join(
        this._rushConfiguration.commonTempFolder,
        RushConstants.nodeModulesFolderName,
        `.${encodedRegistry}`
      );

      try {
        const rushLinkJson: IRushLinkJson = { localLinks: {} };

        for (const rushProject of this._rushConfiguration.projects) {
          console.log(os.EOL + 'LINKING: ' + rushProject.packageName);
          this._linkProject(registryPath, rushProject, rushLinkJson);
        }

        console.log(`Writing "${this._rushConfiguration.rushLinkJsonFilename}"`);
        JsonFile.save(rushLinkJson, this._rushConfiguration.rushLinkJsonFilename);

        stopwatch.stop();
        console.log(os.EOL + colors.green(`Linking finished successfully. (${stopwatch.toString()})`));
        console.log(os.EOL + 'Next you should probably run: "rush rebuild"');

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * This is called once for each local project from Rush.json.
   * @param project             The local project that we will create symlinks for
   * @param rushLinkJson        The common/temp/rush-link.json output file
   */
  private _linkProject(
    pnpmStorePath: string,
    project: RushConfigurationProject,
    rushLinkJson: IRushLinkJson): void {

    // Naively, PNPM creates a directed acyclic graph, rather than a tree
    // thus if sp-http and sp-core-library both depend on GCB@1.2.3,
    // and GCB@1.2.3 depends on gulp-typescript, then for both cases it must
    // be the exact same version of gulp-typescript
    // thus, we only need to link the direct dependencies of this project to the
    // common folder

    // Example: "project1"
    const unscopedTempProjectName: string = Utilities.parseScopedPackageName(project.tempProjectName).name;

    // Example: "C:\MyRepo\common\temp\projects\project1
    const extractedFolder: string = path.join(this._rushConfiguration.commonTempFolder,
      RushConstants.rushTempProjectsFolderName, unscopedTempProjectName);

    // Example: "C:\MyRepo\common\temp\projects\project1.tgz"
    const tarballFile: string = path.join(this._rushConfiguration.commonTempFolder,
      RushConstants.rushTempProjectsFolderName, unscopedTempProjectName + '.tgz');

    // Example: "C:\MyRepo\common\temp\projects\project1\package.json"
    const packageJsonFilename: string = path.join(extractedFolder, 'package', 'package.json');

    Utilities.createFolderWithRetry(extractedFolder);
    tar.extract({
      cwd: extractedFolder,
      file: tarballFile,
      sync: true
    });

    // Example: "C:\MyRepo\common\temp\node_modules\@rush-temp\project1"
    const installFolderName: string = path.join(this._rushConfiguration.commonTempFolder,
      RushConstants.nodeModulesFolderName, RushConstants.rushTempNpmScope, unscopedTempProjectName);

    const commonPackage: Package = Package.createVirtualTempPackage(packageJsonFilename, installFolderName);

    // remove the extracted tarball contents
    fsx.removeSync(packageJsonFilename);
    fsx.removeSync(extractedFolder);

    // TODO: Validate that the project's package.json still matches the common folder
    const localPackage: Package = Package.createLinkedPackage(
      project.packageJson.name,
      commonPackage.version,
      project.projectFolder,
      commonPackage
    );

    // now that we have the temp package.json, we can go ahead and link up all the direct dependencies

    Object.keys(commonPackage.packageJson.rushDependencies || {}).forEach((dependencyName: string) => {
      // Should this be a "local link" to a top-level Rush project (i.e. versus a regular link
      // into the Common folder)?
      const matchedRushPackage: RushConfigurationProject = this._rushConfiguration.getProjectByName(dependencyName);

      if (matchedRushPackage) {
        const matchedVersion: string = matchedRushPackage.packageJson.version;

        let localLinks: string[] = rushLinkJson.localLinks[localPackage.name];
        if (!localLinks) {
          localLinks = [];
          rushLinkJson.localLinks[localPackage.name] = localLinks;
        }
        localLinks.push(dependencyName);

        // We did not find a suitable match, so place a new local package that
        // symlinks to the Rush project
        const newLocalFolderPath: string = path.join(localPackage.folderPath, 'node_modules', dependencyName);

        const newLocalPackage: Package = Package.createLinkedPackage(
          dependencyName,
          matchedVersion,
          newLocalFolderPath
        );

        newLocalPackage.symlinkTargetFolderPath = matchedRushPackage.projectFolder;
        localPackage.children.push(newLocalPackage);
      } else {
        // weird state or program bug
        throw Error('Cannot find rush dependency in rush configuration');
      }
    });

    // Iterate through all the regular dependencies
    Object.keys(commonPackage.packageJson.dependencies || {}).forEach((dependencyName: string) => {
      const dependencyVersionRange: string = commonPackage.packageJson.dependencies[dependencyName];

      // We can't symlink to an Rush project, so instead we will symlink to a folder
      // under the "Common" folder

      // here we need to get the list of versions and find the newest version that
      // satisfies the dependency range (which is what I assume PNPM does)

      const storePackageVersionsPath: string = path.join(
        pnpmStorePath,
        dependencyName
      );

      const availableVersions: string[] = fsx.readdirSync(storePackageVersionsPath).filter((version) => {
        return fsx.lstatSync(path.join(storePackageVersionsPath, version));
      });
      availableVersions.sort((v1: string, v2: string) => {
        return semver.gt(v1, v2) ? 1 : -1;
      });

      let selectedVersion: string;
      for (const version of availableVersions) {
        if (semver.satisfies(version, dependencyVersionRange)) {
          selectedVersion = version;
          break;
        }
      }

      const pnpmStorePackagePath: string = path.join(
        pnpmStorePath,
        dependencyName,
        selectedVersion,
        RushConstants.nodeModulesFolderName,
        dependencyName
      );

      if (fsx.lstatSync(pnpmStorePackagePath).isDirectory()) {
        const newLocalFolderPath: string = path.join(
          localPackage.folderPath, 'node_modules', dependencyName);

        const newLocalPackage: Package = Package.createLinkedPackage(
          dependencyName,
          selectedVersion,
          newLocalFolderPath
        );

        newLocalPackage.symlinkTargetFolderPath = pnpmStorePackagePath;
        localPackage.addChild(newLocalPackage);

      } else {
        throw Error(`The dependency "${dependencyName}" needed by "${localPackage.name}"`
          + ` was not found the common folder -- do you need to run "rush generate"?`);
      }
    });

    // When debugging, you can uncomment this line to dump the data structure
    // to the console:
    localPackage.printTree();
    LinkManager._createSymlinksForTopLevelProject(localPackage);

    // Also symlink the ".bin" folder
    const commonBinFolder: string = path.join(this._rushConfiguration.commonTempFolder, 'node_modules', '.bin');
    const projectBinFolder: string = path.join(localPackage.folderPath, 'node_modules', '.bin');

    if (fsx.existsSync(commonBinFolder)) {
      LinkManager._createSymlink(commonBinFolder, projectBinFolder, SymlinkKind.Directory);
    }
  }
}
