// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { JsonFile } from '@microsoft/node-core-library';

import {
  BaseLinkManager,
  SymlinkKind
} from '../base/BaseLinkManager';
import IPackageJson from '../../../utilities/IPackageJson';
import Utilities from '../../../utilities/Utilities';
import { BasePackage } from '../base/BasePackage';
import { RushConstants } from '../../../RushConstants';
import { IRushLinkJson } from '../../../data/RushConfiguration';
import RushConfigurationProject from '../../../data/RushConfigurationProject';

export class PnpmLinkManager extends BaseLinkManager {
  protected _linkProjects(): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (reason: Error) => void): void => {
      try {
        const rushLinkJson: IRushLinkJson = { localLinks: {} };

        for (const rushProject of this._rushConfiguration.projects) {
          console.log(os.EOL + 'LINKING: ' + rushProject.packageName);
          this._linkProject(rushProject, rushLinkJson);
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
    project: RushConfigurationProject,
    rushLinkJson: IRushLinkJson): void {

    // first, read the temp package.json information

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

    const localPackage: BasePackage = BasePackage.createLinkedPackage(
      project.packageJson.name,
      commonPackage.version,
      project.projectFolder,
      commonPackage
    );

    // now that we have the temp package.json, we can go ahead and link up all the direct dependencies

    // first, start with the rush dependencies, we just need to link to the project folder
    Object.keys(commonPackage.packageJson!.rushDependencies || {}).forEach((dependencyName: string) => {

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
    // each of these dependencies should be linked in a special folder that PNPM
    // creates for the installed version of each .TGZ package, all we need to do
    // is re-use that symlink in order to get linked to whatever PNPM thought was
    // appropriate. This folder is usually something like:
    // C:\{path-to-tgz-with-slashes-replaced-with-"%2F"}\node_modules\{package-name}

    const slashEscapeRegExp: RegExp = new RegExp(path.sep.replace('\\', '\\\\'), 'g');
    const colonEscapeRegExp: RegExp = new RegExp(':', 'g');

    // e.g.: C%3A%2Fwbt%2Fcommon%2Ftemp%2Fprojects%2Fapi-documenter.tgz
    const escapedPathToTgzFile: string = path.join(
      this._rushConfiguration.commonTempFolder,
      'projects',
      `${unscopedTempProjectName}.tgz`)
      .replace(slashEscapeRegExp, '%2F')
      .replace(colonEscapeRegExp, '%3A');

    // tslint:disable-next-line:max-line-length
    // e.g.: C:\wbt\common\temp\node_modules\.local\C%3A%2Fwbt%2Fcommon%2Ftemp%2Fprojects%2Fapi-documenter.tgz\node_modules
    const pathToLocalInstallation: string = path.join(
      this._rushConfiguration.commonTempFolder,
      RushConstants.nodeModulesFolderName,
      '.local',
      escapedPathToTgzFile,
      RushConstants.nodeModulesFolderName);

    Object.keys(commonPackage.packageJson!.dependencies || {}).forEach((dependencyName: string) => {
      // the dependency we are looking for should have already created a symlink here

      const dependencyLocalInstallationSymlink: string = path.join(
        pathToLocalInstallation,
        dependencyName);

      if (!fsx.existsSync(dependencyLocalInstallationSymlink)) {
        throw Error(`Cannot find installed dependency "${dependencyName}" in "${pathToLocalInstallation}"`);
      }

      if (!fsx.lstatSync(dependencyLocalInstallationSymlink).isSymbolicLink()) {
        throw Error(`Dependency "${dependencyName}" is not a symlink in "${pathToLocalInstallation}`);
      }

      const newLocalFolderPath: string = path.join(
          localPackage.folderPath, 'node_modules', dependencyName);

      const packageJsonForDependency: IPackageJson = fsx.readJsonSync(
        path.join(dependencyLocalInstallationSymlink, RushConstants.packageJsonFilename));

      const newLocalPackage: BasePackage = BasePackage.createLinkedPackage(
        dependencyName,
        packageJsonForDependency.version,
        newLocalFolderPath
      );

      newLocalPackage.symlinkTargetFolderPath = dependencyLocalInstallationSymlink;
      localPackage.addChild(newLocalPackage);
    });

    // When debugging, you can uncomment this line to dump the data structure
    // to the console:
    // localPackage.printTree();
    PnpmLinkManager._createSymlinksForTopLevelProject(localPackage);

    // Also symlink the ".bin" folder
    const commonBinFolder: string = path.join(this._rushConfiguration.commonTempFolder, 'node_modules', '.bin');
    const projectBinFolder: string = path.join(localPackage.folderPath, 'node_modules', '.bin');

    if (fsx.existsSync(commonBinFolder)) {
      PnpmLinkManager._createSymlink(commonBinFolder, projectBinFolder, SymlinkKind.Directory);
    }
  }
}