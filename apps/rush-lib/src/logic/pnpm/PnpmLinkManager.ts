// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';
import uriEncode = require('strict-uri-encode');
import pnpmLinkBins from '@pnpm/link-bins';

import {
  JsonFile,
  Text,
  IPackageJson,
  PackageName,
  FileSystem,
  FileConstants,
  InternalError
} from '@microsoft/node-core-library';

import {
  BaseLinkManager
} from '../base/BaseLinkManager';
import { BasePackage } from '../base/BasePackage';
import { RushConstants } from '../../logic/RushConstants';
import { IRushLinkJson } from '../../api/RushConfiguration';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PnpmShrinkwrapFile } from './PnpmShrinkwrapFile';
import { PnpmProjectDependencyManifest } from './PnpmProjectDependencyManifest';

// special flag for debugging, will print extra diagnostic information,
// but comes with performance cost
const DEBUG: boolean = false;

export class PnpmLinkManager extends BaseLinkManager {
  protected _linkProjects(): Promise<void> {
    try {
      const rushLinkJson: IRushLinkJson = {
        localLinks: {}
      };

      // Use shrinkwrap from temp as the committed shrinkwrap may not always be up to date
      // See https://github.com/microsoft/web-build-tools/issues/1273#issuecomment-492779995
      const pnpmShrinkwrapFile: PnpmShrinkwrapFile | undefined = PnpmShrinkwrapFile.loadFromFile(
        this._rushConfiguration.tempShrinkwrapFilename
      );

      if (!pnpmShrinkwrapFile) {
        throw new InternalError(`Cannot load shrinkwrap at "${this._rushConfiguration.tempShrinkwrapFilename}"`);
      }

      let promise: Promise<void> = Promise.resolve();

      for (const rushProject of this._rushConfiguration.projects) {
        promise = promise.then(() => {
          console.log(os.EOL + 'LINKING: ' + rushProject.packageName);
          return this._linkProject(rushProject, rushLinkJson, pnpmShrinkwrapFile);
        });
      }

      return promise.then(() => {
        console.log(`Writing "${this._rushConfiguration.rushLinkJsonFilename}"`);
        JsonFile.save(rushLinkJson, this._rushConfiguration.rushLinkJsonFilename);
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * This is called once for each local project from Rush.json.
   * @param project             The local project that we will create symlinks for
   * @param rushLinkJson        The common/temp/rush-link.json output file
   */
  private _linkProject(
    project: RushConfigurationProject,
    rushLinkJson: IRushLinkJson,
    pnpmShrinkwrapFile: PnpmShrinkwrapFile
  ): Promise<void> {

    // first, read the temp package.json information

    // Example: "project1"
    const unscopedTempProjectName: string = PackageName.getUnscopedName(project.tempProjectName);

    // Example: "C:\MyRepo\common\temp\projects\project1
    const extractedFolder: string = path.join(this._rushConfiguration.commonTempFolder,
      RushConstants.rushTempProjectsFolderName, unscopedTempProjectName);

    // Example: "C:\MyRepo\common\temp\projects\project1\package.json"
    const packageJsonFilename: string = path.join(extractedFolder, FileConstants.PackageJson);

    // Example: "C:\MyRepo\common\temp\node_modules\@rush-temp\project1"
    const installFolderName: string = path.join(
      this._rushConfiguration.commonTempFolder,
      RushConstants.nodeModulesFolderName,
      RushConstants.rushTempNpmScope,
      unscopedTempProjectName
    );

    const commonPackage: BasePackage = BasePackage.createVirtualTempPackage(packageJsonFilename, installFolderName);

    const localPackage: BasePackage = BasePackage.createLinkedPackage(
      project.packageJsonEditor.name,
      commonPackage.version,
      project.projectFolder
    );

    // now that we have the temp package.json, we can go ahead and link up all the direct dependencies

    // first, start with the rush dependencies, we just need to link to the project folder
    for (const dependencyName of Object.keys(commonPackage.packageJson!.rushDependencies || {})) {
      const matchedRushPackage: RushConfigurationProject | undefined =
        this._rushConfiguration.getProjectByName(dependencyName);

      if (matchedRushPackage) {
        // We found a suitable match, so place a new local package that
        // symlinks to the Rush project
        const matchedVersion: string = matchedRushPackage.packageJsonEditor.version;

        let localLinks: string[] = rushLinkJson.localLinks[localPackage.name];
        if (!localLinks) {
          localLinks = [];
          rushLinkJson.localLinks[localPackage.name] = localLinks;
        }
        localLinks.push(dependencyName);

        // e.g. "C:\my-repo\project-a\node_modules\project-b" if project-b is a rush dependency of project-a
        const newLocalFolderPath: string = path.join(localPackage.folderPath, 'node_modules', dependencyName);

        const newLocalPackage: BasePackage = BasePackage.createLinkedPackage(
          dependencyName,
          matchedVersion,
          newLocalFolderPath
        );

        newLocalPackage.symlinkTargetFolderPath = matchedRushPackage.projectFolder;
        localPackage.children.push(newLocalPackage);
      } else {
        throw new InternalError(
          `Cannot find dependency "${dependencyName}" for "${project.packageName}" in the Rush configuration`
        );
      }
    }

    // Iterate through all the regular dependencies

    // With npm, it's possible for two different projects to have dependencies on
    // the same version of the same library, but end up with different implementations
    // of that library, if the library is installed twice and with different secondary
    // dependencies.The NpmLinkManager recursively links dependency folders to try to
    // honor this. Since PNPM always uses the same physical folder to represent a given
    // version of a library, we only need to link directly to the folder that PNPM has chosen,
    // and it will have a consistent set of secondary dependencies.

    // each of these dependencies should be linked in a special folder that pnpm
    // creates for the installed version of each .TGZ package, all we need to do
    // is re-use that symlink in order to get linked to whatever PNPM thought was
    // appropriate. This folder is usually something like:
    // C:\{uri-encoed-path-to-tgz}\node_modules\{package-name}

    // e.g.:
    //   file:projects/bentleyjs-core.tgz
    //   file:projects/build-tools.tgz_dc21d88642e18a947127a751e00b020a
    //   file:projects/imodel-from-geojson.tgz_request@2.88.0
    const tempProjectDependencyKey: string | undefined = pnpmShrinkwrapFile.getTempProjectDependencyKey(
      project.tempProjectName
    );

    if (!tempProjectDependencyKey) {
      throw new Error(`Cannot get dependency key for temp project: ${project.tempProjectName}`);
    }
    // e.g.: file:projects/project-name.tgz
    const tarballEntry: string | undefined = pnpmShrinkwrapFile.getTarballPath(tempProjectDependencyKey);

    if (!tarballEntry) {
      throw new InternalError(`Cannot find tarball path for "${project.tempProjectName}" in shrinkwrap.`);
    }

    // e.g.: projects\api-documenter.tgz
    const relativePathToTgzFile: string | undefined = tarballEntry.slice(`file:`.length);

    // e.g.: C:\wbt\common\temp\projects\api-documenter.tgz
    const absolutePathToTgzFile: string = path.resolve(this._rushConfiguration.commonTempFolder, relativePathToTgzFile);

    // The folder name in `.local` is constructed as:
    //   UriEncode(absolutePathToTgzFile) + _suffix
    //
    // Note that _suffix is not encoded. The tarball attribute of the package 'file:projects/project-name.tgz_suffix'
    // holds the tarball path 'file:projects/project-name.tgz', which can be used for the constructing the folder name.
    //
    // '_suffix' is extracted by stripping the tarball path from top level dependency value.
    // tarball path = 'file:projects/project-name.tgz'
    // top level dependency = 'file:projects/project-name.tgz_suffix'

    // e.g.:
    //   '' [empty string]
    //   _jsdom@11.12.0
    //   _2a665c89609864b4e75bc5365d7f8f56
    const folderNameSuffix: string = tarballEntry && tarballEntry.length < tempProjectDependencyKey.length
      ? tempProjectDependencyKey.slice(tarballEntry.length)
      : '';

    // e.g.:
    //   C%3A%2Fwbt%2Fcommon%2Ftemp%2Fprojects%2Fapi-documenter.tgz
    //   C%3A%2Fdev%2Fimodeljs%2Fimodeljs%2Fcommon%2Ftemp%2Fprojects%2Fpresentation-integration-tests.tgz_jsdom@11.12.0
    //   C%3A%2Fdev%2Fimodeljs%2Fimodeljs%2Fcommon%2Ftemp%2Fprojects%2Fbuild-tools.tgz_2a665c89609864b4e75bc5365d7f8f56
    const folderNameInLocalInstallationRoot: string = uriEncode(Text.replaceAll(absolutePathToTgzFile, path.sep, '/')) +
      folderNameSuffix;

    // tslint:disable-next-line:max-line-length
    // e.g.: C:\wbt\common\temp\node_modules\.local\C%3A%2Fwbt%2Fcommon%2Ftemp%2Fprojects%2Fapi-documenter.tgz\node_modules
    const pathToLocalInstallation: string = path.join(
      this._rushConfiguration.commonTempFolder,
      RushConstants.nodeModulesFolderName,
      '.local',
      folderNameInLocalInstallationRoot,
      RushConstants.nodeModulesFolderName
    );

    const pnpmProjectDependencyManifest: PnpmProjectDependencyManifest = new PnpmProjectDependencyManifest({
      pnpmShrinkwrapFile,
      project
    });

    for (const dependencyName of Object.keys(commonPackage.packageJson!.dependencies || {})) {
      // the dependency we are looking for should have already created a symlink here

      // FYI dependencyName might contain an NPM scope, here it gets converted into a filesystem folder name
      // e.g. if the dependency is supi:
      // tslint:disable-next-line:max-line-length
      // "C:\wbt\common\temp\node_modules\.local\C%3A%2Fwbt%2Fcommon%2Ftemp%2Fprojects%2Fapi-documenter.tgz\node_modules\supi"
      const dependencyLocalInstallationSymlink: string = path.join(
        pathToLocalInstallation,
        dependencyName);

      if (!FileSystem.exists(dependencyLocalInstallationSymlink)) {
        // if this occurs, it is a bug in Rush algorithm or unexpected PNPM behavior
        throw new InternalError(`Cannot find installed dependency "${dependencyName}" in "${pathToLocalInstallation}"`);
      }

      if (!FileSystem.getLinkStatistics(dependencyLocalInstallationSymlink).isSymbolicLink()) {
        // if this occurs, it is a bug in Rush algorithm or unexpected PNPM behavior
        throw new InternalError(`Dependency "${dependencyName}" is not a symlink in "${pathToLocalInstallation}`);
      }

      // The dependencyLocalInstallationSymlink is just a symlink to another folder.
      // To reduce the number of filesystem reads that are needed, we will link to where that symlink
      // it pointed, rather than linking to a link.
      const dependencyLocalInstallationRealpath: string = FileSystem.getRealPath(dependencyLocalInstallationSymlink);

      const newLocalFolderPath: string = path.join(localPackage.folderPath, 'node_modules', dependencyName);

      // read the version number
      const packageJsonForDependency: IPackageJson = JsonFile.load(
        path.join(dependencyLocalInstallationRealpath, FileConstants.PackageJson)
      );
      const version: string | undefined = packageJsonForDependency.version;

      const newLocalPackage: BasePackage = BasePackage.createLinkedPackage(
        dependencyName,
        version,
        newLocalFolderPath
      );

      pnpmProjectDependencyManifest.addDependency(newLocalPackage);

      newLocalPackage.symlinkTargetFolderPath = dependencyLocalInstallationRealpath;
      localPackage.addChild(newLocalPackage);
    }

    if (DEBUG) {
      localPackage.printTree();
    }

    PnpmLinkManager._createSymlinksForTopLevelProject(localPackage);

    pnpmProjectDependencyManifest.save();

    // Also symlink the ".bin" folder
    const projectFolder: string = path.join(localPackage.folderPath, 'node_modules');
    const projectBinFolder: string = path.join(localPackage.folderPath, 'node_modules', '.bin');

    // Return type is Promise<void[]> because the API returns Promise.all()
    return pnpmLinkBins(projectFolder, projectBinFolder)
      .then(() => { /* empty block */ });
  }
}
