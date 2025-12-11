// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as crypto from 'node:crypto';

import uriEncode from 'strict-uri-encode';
import pnpmLinkBins from '@pnpm/link-bins';
import * as semver from 'semver';

import {
  AlreadyReportedError,
  FileSystem,
  FileConstants,
  InternalError,
  Path
} from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import { BaseLinkManager } from '../base/BaseLinkManager';
import { BasePackage } from '../base/BasePackage';
import { RushConstants } from '../RushConstants';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import {
  PnpmShrinkwrapFile,
  type IPnpmShrinkwrapDependencyYaml,
  type IPnpmVersionSpecifier,
  normalizePnpmVersionSpecifier
} from './PnpmShrinkwrapFile';

// special flag for debugging, will print extra diagnostic information,
// but comes with performance cost
const DEBUG: boolean = false;

export class PnpmLinkManager extends BaseLinkManager {
  private readonly _pnpmVersion: semver.SemVer = new semver.SemVer(
    this._rushConfiguration.packageManagerToolVersion
  );

  /**
   * @override
   */
  public async createSymlinksForProjectsAsync(force: boolean): Promise<void> {
    const useWorkspaces: boolean =
      this._rushConfiguration.pnpmOptions && this._rushConfiguration.pnpmOptions.useWorkspaces;
    if (useWorkspaces) {
      // eslint-disable-next-line no-console
      console.log(
        Colorize.red(
          'Linking is not supported when using workspaces. Run "rush install" or "rush update" ' +
            'to restore project node_modules folders.'
        )
      );
      throw new AlreadyReportedError();
    }

    await super.createSymlinksForProjectsAsync(force);
  }

  protected async _linkProjectsAsync(): Promise<void> {
    if (this._rushConfiguration.projects.length > 0) {
      // Use shrinkwrap from temp as the committed shrinkwrap may not always be up to date
      // See https://github.com/microsoft/rushstack/issues/1273#issuecomment-492779995
      const pnpmShrinkwrapFile: PnpmShrinkwrapFile | undefined = await PnpmShrinkwrapFile.loadFromFileAsync(
        this._rushConfiguration.defaultSubspace.getTempShrinkwrapFilename()
      );

      if (!pnpmShrinkwrapFile) {
        throw new InternalError(
          `Cannot load shrinkwrap at "${this._rushConfiguration.defaultSubspace.getTempShrinkwrapFilename()}"`
        );
      }

      for (const rushProject of this._rushConfiguration.projects) {
        await this._linkProjectAsync(rushProject, pnpmShrinkwrapFile);
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(
        Colorize.yellow(
          `\nWarning: Nothing to do. Please edit ${RushConstants.rushJsonFilename} and add at least one project` +
            ' to the "projects" section.\n'
        )
      );
    }
  }

  /**
   * This is called once for each local project from Rush.json.
   * @param project             The local project that we will create symlinks for
   * @param rushLinkJson        The common/temp/rush-link.json output file
   */
  private async _linkProjectAsync(
    project: RushConfigurationProject,
    pnpmShrinkwrapFile: PnpmShrinkwrapFile
  ): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`\nLINKING: ${project.packageName}`);

    // first, read the temp package.json information
    // Example: "project1"
    const unscopedTempProjectName: string = this._rushConfiguration.packageNameParser.getUnscopedName(
      project.tempProjectName
    );

    // Example: "C:\MyRepo\common\temp\projects\project1
    const extractedFolder: string = path.join(
      this._rushConfiguration.commonTempFolder,
      RushConstants.rushTempProjectsFolderName,
      unscopedTempProjectName
    );

    // Example: "C:\MyRepo\common\temp\projects\project1\package.json"
    const packageJsonFilename: string = path.join(extractedFolder, FileConstants.PackageJson);

    // Example: "C:\MyRepo\common\temp\node_modules\@rush-temp\project1"
    const installFolderName: string = path.join(
      this._rushConfiguration.commonTempFolder,
      RushConstants.nodeModulesFolderName,
      RushConstants.rushTempNpmScope,
      unscopedTempProjectName
    );

    const commonPackage: BasePackage = BasePackage.createVirtualTempPackage(
      packageJsonFilename,
      installFolderName
    );

    const localPackage: BasePackage = BasePackage.createLinkedPackage(
      project.packageName,
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
    // C:\{uri-encoded-path-to-tgz}\node_modules\{package-name}

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
    const absolutePathToTgzFile: string = path.resolve(
      this._rushConfiguration.commonTempFolder,
      relativePathToTgzFile
    );

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
    //   _@types+node@14.18.36
    //   _jsdom@11.12.0
    //   _2a665c89609864b4e75bc5365d7f8f56
    //   (@types/node@14.18.36)
    const folderNameSuffix: string =
      tarballEntry && tarballEntry.length < tempProjectDependencyKey.length
        ? tempProjectDependencyKey.slice(tarballEntry.length)
        : '';

    // e.g.: C:\wbt\common\temp\node_modules\.local\C%3A%2Fwbt%2Fcommon%2Ftemp%2Fprojects%2Fapi-documenter.tgz\node_modules
    const pathToLocalInstallation: string = await this._getPathToLocalInstallationAsync(
      tarballEntry,
      absolutePathToTgzFile,
      folderNameSuffix,
      tempProjectDependencyKey
    );

    const parentShrinkwrapEntry: IPnpmShrinkwrapDependencyYaml | undefined =
      pnpmShrinkwrapFile.getShrinkwrapEntryFromTempProjectDependencyKey(tempProjectDependencyKey);
    if (!parentShrinkwrapEntry) {
      throw new InternalError(
        `Cannot find shrinkwrap entry using dependency key for temp project: ${project.tempProjectName}`
      );
    }

    for (const dependencyName of Object.keys(commonPackage.packageJson!.dependencies || {})) {
      const newLocalPackage: BasePackage = this._createLocalPackageForDependency(
        project,
        parentShrinkwrapEntry,
        localPackage,
        pathToLocalInstallation,
        dependencyName
      )!;
      localPackage.addChild(newLocalPackage);
    }

    // TODO: Rush does not currently handle optional dependencies of projects. This should be uncommented when
    // support is added
    // for (const dependencyName of Object.keys(commonPackage.packageJson!.optionalDependencies || {})) {
    //   const newLocalPackage: BasePackage | undefined = this._createLocalPackageForDependency(
    //     project,
    //     parentShrinkwrapEntry,
    //     localPackage,
    //     pathToLocalInstallation,
    //     dependencyName,
    //     true); // isOptional
    //   if (newLocalPackage) {
    //     localPackage.addChild(newLocalPackage);
    //   }
    // }

    if (DEBUG) {
      localPackage.printTree();
    }

    await pnpmShrinkwrapFile.getProjectShrinkwrap(project)!.updateProjectShrinkwrapAsync();

    await PnpmLinkManager._createSymlinksForTopLevelProjectAsync(localPackage);

    // Also symlink the ".bin" folder
    const projectFolder: string = path.join(localPackage.folderPath, 'node_modules');
    const projectBinFolder: string = path.join(localPackage.folderPath, 'node_modules', '.bin');

    await pnpmLinkBins(projectFolder, projectBinFolder, {
      warn: (msg: string) => {
        // eslint-disable-next-line no-console
        console.warn(Colorize.yellow(msg));
      }
    });
  }

  private async _getPathToLocalInstallationAsync(
    tarballEntry: string,
    absolutePathToTgzFile: string,
    folderSuffix: string,
    tempProjectDependencyKey: string
  ): Promise<string> {
    if (this._pnpmVersion.major === 6) {
      // PNPM 6 changed formatting to replace all ':' and '/' chars with '+'. Additionally, folder names > 120
      // are trimmed and hashed. NOTE: PNPM internally uses fs.realpath.native, which will cause additional
      // issues in environments that do not support long paths.
      // See https://github.com/pnpm/pnpm/releases/tag/v6.0.0
      // e.g.:
      //   C++dev+imodeljs+imodeljs+common+temp+projects+presentation-integration-tests.tgz_jsdom@11.12.0
      //   C++dev+imodeljs+imodeljs+common+temp+projects+presentation-integrat_089eb799caf0f998ab34e4e1e9254956
      const specialCharRegex: RegExp = /\/|:/g;
      const escapedLocalPath: string = Path.convertToSlashes(absolutePathToTgzFile).replace(
        specialCharRegex,
        '+'
      );
      let folderName: string = `local+${escapedLocalPath}${folderSuffix}`;
      if (folderName.length > 120) {
        folderName = `${folderName.substring(0, 50)}_${crypto
          .createHash('md5')
          .update(folderName)
          .digest('hex')}`;
      }

      return path.join(
        this._rushConfiguration.commonTempFolder,
        RushConstants.nodeModulesFolderName,
        '.pnpm',
        folderName,
        RushConstants.nodeModulesFolderName
      );
    } else if (this._pnpmVersion.major >= 10) {
      const pnpmKitV10: typeof import('@rushstack/rush-pnpm-kit-v10') = await import(
        '@rushstack/rush-pnpm-kit-v10'
      );

      // project@file+projects+presentation-integration-tests.tgz_jsdom@11.12.0
      // The second parameter is max length of virtual store dir,
      // for v10 default is 120 on Linux/MacOS and 60 on Windows https://pnpm.io/next/settings#virtualstoredirmaxlength
      // TODO Read virtual-store-dir-max-length from .npmrc
      const folderName: string = pnpmKitV10.dependencyPath.depPathToFilename(
        tempProjectDependencyKey,
        process.platform === 'win32' ? 60 : 120
      );
      return path.join(
        this._rushConfiguration.commonTempFolder,
        RushConstants.nodeModulesFolderName,
        '.pnpm',
        folderName,
        RushConstants.nodeModulesFolderName
      );
    } else if (this._pnpmVersion.major >= 9) {
      const pnpmKitV9: typeof import('@rushstack/rush-pnpm-kit-v9') = await import(
        '@rushstack/rush-pnpm-kit-v9'
      );

      // project@file+projects+presentation-integration-tests.tgz_jsdom@11.12.0
      // The second parameter is max length of virtual store dir, for v9 default is 120 https://pnpm.io/9.x/npmrc#virtual-store-dir-max-length
      // TODO Read virtual-store-dir-max-length from .npmrc
      const folderName: string = pnpmKitV9.dependencyPath.depPathToFilename(tempProjectDependencyKey, 120);
      return path.join(
        this._rushConfiguration.commonTempFolder,
        RushConstants.nodeModulesFolderName,
        '.pnpm',
        folderName,
        RushConstants.nodeModulesFolderName
      );
    } else if (this._pnpmVersion.major >= 8) {
      const pnpmKitV8: typeof import('@rushstack/rush-pnpm-kit-v8') = await import(
        '@rushstack/rush-pnpm-kit-v8'
      );
      // PNPM 8 changed the local path format again and the hashing algorithm, and
      // is now using the scoped '@pnpm/dependency-path' package
      // See https://github.com/pnpm/pnpm/releases/tag/v8.0.0
      // e.g.:
      //   file+projects+presentation-integration-tests.tgz_jsdom@11.12.0
      const folderName: string = pnpmKitV8.dependencyPath.depPathToFilename(`${tarballEntry}${folderSuffix}`);
      return path.join(
        this._rushConfiguration.commonTempFolder,
        RushConstants.nodeModulesFolderName,
        '.pnpm',
        folderName,
        RushConstants.nodeModulesFolderName
      );
    } else if (this._pnpmVersion.major >= 7) {
      const { depPathToFilename } = await import('dependency-path');
      // PNPM 7 changed the local path format again and the hashing algorithm
      // See https://github.com/pnpm/pnpm/releases/tag/v7.0.0
      // e.g.:
      //   file+projects+presentation-integration-tests.tgz_jsdom@11.12.0
      const escapedLocalPath: string = depPathToFilename(tarballEntry);
      const folderName: string = `${escapedLocalPath}${folderSuffix}`;
      return path.join(
        this._rushConfiguration.commonTempFolder,
        RushConstants.nodeModulesFolderName,
        '.pnpm',
        folderName,
        RushConstants.nodeModulesFolderName
      );
    } else {
      // e.g.:
      //   C%3A%2Fwbt%2Fcommon%2Ftemp%2Fprojects%2Fapi-documenter.tgz
      //   C%3A%2Fdev%2Fimodeljs%2Fimodeljs%2Fcommon%2Ftemp%2Fprojects%2Fpresentation-integration-tests.tgz_jsdom@11.12.0
      //   C%3A%2Fdev%2Fimodeljs%2Fimodeljs%2Fcommon%2Ftemp%2Fprojects%2Fbuild-tools.tgz_2a665c89609864b4e75bc5365d7f8f56
      const folderNameInLocalInstallationRoot: string =
        uriEncode(Path.convertToSlashes(absolutePathToTgzFile)) + folderSuffix;

      // See https://github.com/pnpm/pnpm/releases/tag/v4.0.0
      return path.join(
        this._rushConfiguration.commonTempFolder,
        RushConstants.nodeModulesFolderName,
        '.pnpm',
        'local',
        folderNameInLocalInstallationRoot,
        RushConstants.nodeModulesFolderName
      );
    }
  }
  private _createLocalPackageForDependency(
    project: RushConfigurationProject,
    parentShrinkwrapEntry: IPnpmShrinkwrapDependencyYaml,
    localPackage: BasePackage,
    pathToLocalInstallation: string,
    dependencyName: string,
    isOptional: boolean = false
  ): BasePackage | undefined {
    // the dependency we are looking for should have already created a symlink here

    // FYI dependencyName might contain an NPM scope, here it gets converted into a filesystem folder name
    // e.g. if the dependency is supi:
    // "C:\wbt\common\temp\node_modules\.local\C%3A%2Fwbt%2Fcommon%2Ftemp%2Fprojects%2Fapi-documenter.tgz\node_modules\supi"
    const dependencyLocalInstallationSymlink: string = path.join(pathToLocalInstallation, dependencyName);

    if (!FileSystem.exists(dependencyLocalInstallationSymlink)) {
      // if this occurs, it is a bug in Rush algorithm or unexpected PNPM behavior
      throw new InternalError(
        `Cannot find installed dependency "${dependencyName}" in "${pathToLocalInstallation}"`
      );
    }

    if (!FileSystem.getLinkStatistics(dependencyLocalInstallationSymlink).isSymbolicLink()) {
      // if this occurs, it is a bug in Rush algorithm or unexpected PNPM behavior
      throw new InternalError(
        `Dependency "${dependencyName}" is not a symlink in "${pathToLocalInstallation}`
      );
    }

    // read the version number from the shrinkwrap entry and return if no version is specified
    // and the dependency is optional
    const versionSpecifier: IPnpmVersionSpecifier | undefined = isOptional
      ? (parentShrinkwrapEntry.optionalDependencies || {})[dependencyName]
      : (parentShrinkwrapEntry.dependencies || {})[dependencyName];
    if (!versionSpecifier) {
      if (!isOptional) {
        throw new InternalError(
          `Cannot find shrinkwrap entry dependency "${dependencyName}" for temp project: ` +
            `${project.tempProjectName}`
        );
      }
      return;
    }

    const newLocalFolderPath: string = path.join(localPackage.folderPath, 'node_modules', dependencyName);
    const version: string = normalizePnpmVersionSpecifier(versionSpecifier);
    const newLocalPackage: BasePackage = BasePackage.createLinkedPackage(
      dependencyName,
      version,
      newLocalFolderPath
    );

    // The dependencyLocalInstallationSymlink is just a symlink to another folder. To reduce the number of filesystem
    // reads that are needed, we will link to where that symlink pointed, rather than linking to a link.
    newLocalPackage.symlinkTargetFolderPath = FileSystem.getRealPath(dependencyLocalInstallationSymlink);
    return newLocalPackage;
  }
}
