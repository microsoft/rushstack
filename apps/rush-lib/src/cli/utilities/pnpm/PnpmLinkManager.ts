// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import encodeRegistry = require('encode-registry');

import { JsonFile } from '@microsoft/node-core-library';

import {
  BaseLinkManager,
  SymlinkKind
} from '../base/BaseLinkManager';
import Utilities from '../../../utilities/Utilities';
import { BasePackage } from '../base/BasePackage';
import { RushConstants } from '../../../RushConstants';
import { IRushLinkJson } from '../../../data/RushConfiguration';
import RushConfigurationProject from '../../../data/RushConfigurationProject';

export class PnpmLinkManager extends BaseLinkManager {
  protected _linkProjects(): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (reason: Error) => void): void => {
      // go ahead and find out the registry we are using, we need this to locate the pnpm store folder

      // EXAMPLE: https://onedrive.pkgs.visualstudio.com/_packaging/odsp-npm/npm/registry
      const registryUrl: string = Utilities.executeCommandAndCaptureOutput(
        this._rushConfiguration.packageManagerToolFilename,
        ['config', 'get', 'registry'],
        this._rushConfiguration.commonTempFolder,
        process.env);

      // EXAMPLE: onedrive.pkgs.visualstudio.com
      const encodedRegistry: string = encodeRegistry(registryUrl);

      // EXAMPLE: c:/src/foo/common/temp/node_modules/.onedrive.pkgs.visualstudio.com
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

    // PNPM creates a directed acyclic graph, rather than a tree.
    // Thus, imagine "sp-http" and "sp-core-library" both depend on "request"@1.2.3,
    // and "request"@1.2.3 depends on "http@*", then both "sp-http" and "sp-core-library"
    // must have the exact same version of "http"
    // thus, we only need to link the direct dependencies of this project to the
    // common folder

    // Example: "project1"
    const unscopedTempProjectName: string = Utilities.parseScopedPackageName(project.tempProjectName).name;

    // Example: "C:\MyRepo\common\temp\projects\project1
    const extractedFolder: string = path.join(this._rushConfiguration.commonTempFolder,
      RushConstants.rushTempProjectsFolderName, unscopedTempProjectName);

    // Example: "C:\MyRepo\common\temp\projects\project1\package.json"
    const packageJsonFilename: string = path.join(extractedFolder, 'package.json');

    // Example: "C:\MyRepo\common\temp\node_modules\@rush-temp\project1"
    const installFolderName: string = path.join(this._rushConfiguration.commonTempFolder,
      RushConstants.nodeModulesFolderName, RushConstants.rushTempNpmScope, unscopedTempProjectName);

    const commonPackage: BasePackage = BasePackage.createVirtualTempPackage(packageJsonFilename, installFolderName);

    // @TODO: Validate that the project's package.json still matches the common folder

    const localPackage: BasePackage = BasePackage.createLinkedPackage(
      project.packageJson.name,
      commonPackage.version,
      project.projectFolder,
      commonPackage
    );

    // now that we have the temp package.json, we can go ahead and link up all the direct dependencies

    Object.keys(commonPackage.packageJson!.rushDependencies || {}).forEach((dependencyName: string) => {
      // Should this be a "local link" to a top-level Rush project (i.e. versus a regular link
      // into the Common folder)?
      const matchedRushPackage: RushConfigurationProject | undefined =
        this._rushConfiguration.getProjectByName(dependencyName);

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

        const newLocalPackage: BasePackage = BasePackage.createLinkedPackage(
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
    Object.keys(commonPackage.packageJson!.dependencies || {}).forEach((dependencyName: string) => {
      const dependencyVersionRange: string = commonPackage.packageJson!.dependencies![dependencyName];

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
        selectedVersion!,
        RushConstants.nodeModulesFolderName,
        dependencyName
      );

      if (fsx.lstatSync(pnpmStorePackagePath).isDirectory()) {
        const newLocalFolderPath: string = path.join(
           localPackage.folderPath, 'node_modules', dependencyName);

        const newLocalPackage: BasePackage = BasePackage.createLinkedPackage(
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
    PnpmLinkManager._createSymlinksForTopLevelProject(localPackage);

    // Also symlink the ".bin" folder
    const commonBinFolder: string = path.join(this._rushConfiguration.commonTempFolder, 'node_modules', '.bin');
    const projectBinFolder: string = path.join(localPackage.folderPath, 'node_modules', '.bin');

    if (fsx.existsSync(commonBinFolder)) {
      PnpmLinkManager._createSymlink(commonBinFolder, projectBinFolder, SymlinkKind.Directory);
    }
  }
}