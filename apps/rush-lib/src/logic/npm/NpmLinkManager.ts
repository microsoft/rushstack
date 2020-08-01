// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// eslint-disable-next-line
const importLazy = require('import-lazy')(require);

console.log('NpmLinkManager.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
import * as colors from 'colors';
console.log('NpmLinkManager.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);
import * as os from 'os';
console.log('NpmLinkManager.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);
import * as path from 'path';
console.log('NpmLinkManager.ts  : 4: ' + (new Date().getTime() % 20000) / 1000.0);
import * as semver from 'semver';
console.log('NpmLinkManager.ts  : 5: ' + (new Date().getTime() % 20000) / 1000.0);
// import * as tar from 'tar';
// eslint-disable-next-line
const tar = importLazy('tar');
console.log('NpmLinkManager.ts  : 6: ' + (new Date().getTime() % 20000) / 1000.0);
// import readPackageTree = require('read-package-tree');
// eslint-disable-next-line
const readPackageTree = importLazy('read-package-tree');
console.log('NpmLinkManager.ts  : 7: ' + (new Date().getTime() % 20000) / 1000.0);
import { FileSystem, FileConstants, LegacyAdapters } from '@rushstack/node-core-library';
console.log('NpmLinkManager.ts  : 8: ' + (new Date().getTime() % 20000) / 1000.0);

import { RushConstants } from '../../logic/RushConstants';
console.log('NpmLinkManager.ts  : 9: ' + (new Date().getTime() % 20000) / 1000.0);
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
console.log('NpmLinkManager.ts  : 10: ' + (new Date().getTime() % 20000) / 1000.0);
import { Utilities } from '../../utilities/Utilities';
console.log('NpmLinkManager.ts  : 11: ' + (new Date().getTime() % 20000) / 1000.0);
import { NpmPackage, IResolveOrCreateResult, PackageDependencyKind } from './NpmPackage';
console.log('NpmLinkManager.ts  : 12: ' + (new Date().getTime() % 20000) / 1000.0);
import { PackageLookup } from '../PackageLookup';
console.log('NpmLinkManager.ts  : 13: ' + (new Date().getTime() % 20000) / 1000.0);
import { BaseLinkManager, SymlinkKind } from '../base/BaseLinkManager';
console.log('NpmLinkManager.ts  : 14: ' + (new Date().getTime() % 20000) / 1000.0);

interface IQueueItem {
  // A project from somewhere under "common/temp/node_modules"
  commonPackage: NpmPackage;

  // A symlinked virtual package that we will create somewhere under "this-project/node_modules"
  localPackage: NpmPackage;

  // If we encounter a dependency listed in cyclicDependencyProjects, this will be set to the root
  // of the localPackage subtree where we will stop creating local links.
  cyclicSubtreeRoot: NpmPackage | undefined;
}

interface readPackageTreeNode {
  id: number;
  package: any;
  children: readPackageTreeNode[];
  parent: readPackageTreeNode | null;
  path: string;
  realpath: string;
  error: Error | null;
  isLink: boolean;
}

export class NpmLinkManager extends BaseLinkManager {
  protected async _linkProjects(): Promise<void> {
    const npmPackage: readPackageTreeNode = await LegacyAdapters.convertCallbackToPromise<
      readPackageTreeNode,
      Error,
      string
    >(readPackageTree, this._rushConfiguration.commonTempFolder);

    const commonRootPackage: NpmPackage = NpmPackage.createFromNpm(npmPackage);

    const commonPackageLookup: PackageLookup = new PackageLookup();
    commonPackageLookup.loadTree(commonRootPackage);

    for (const rushProject of this._rushConfiguration.projects) {
      console.log(os.EOL + 'LINKING: ' + rushProject.packageName);
      this._linkProject(rushProject, commonRootPackage, commonPackageLookup);
    }
  }

  /**
   * This is called once for each local project from Rush.json.
   * @param project             The local project that we will create symlinks for
   * @param commonRootPackage   The common/temp/package.json package
   * @param commonPackageLookup A dictionary for finding packages under common/temp/node_modules
   */
  private _linkProject(
    project: RushConfigurationProject,
    commonRootPackage: NpmPackage,
    commonPackageLookup: PackageLookup
  ): void {
    let commonProjectPackage: NpmPackage | undefined = commonRootPackage.getChildByName(
      project.tempProjectName
    ) as NpmPackage;
    if (!commonProjectPackage) {
      // Normally we would expect the temp project to have been installed into the common\node_modules
      // folder.  However, if it was recently added, "rush install" doesn't technically require
      // this, as long as its dependencies can be found at the root of the NPM shrinkwrap file.
      // This avoids the need to run "rush generate" unnecessarily.

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

      // Example: "C:\MyRepo\common\temp\projects\project1.tgz"
      const tarballFile: string = path.join(
        this._rushConfiguration.commonTempFolder,
        RushConstants.rushTempProjectsFolderName,
        unscopedTempProjectName + '.tgz'
      );

      // Example: "C:\MyRepo\common\temp\projects\project1\package.json"
      const packageJsonFilename: string = path.join(extractedFolder, 'package', FileConstants.PackageJson);

      Utilities.createFolderWithRetry(extractedFolder);
      tar.extract({
        cwd: extractedFolder,
        file: tarballFile,
        sync: true
      });

      // Example: "C:\MyRepo\common\temp\node_modules\@rush-temp\project1"
      const installFolderName: string = path.join(
        this._rushConfiguration.commonTempFolder,
        RushConstants.nodeModulesFolderName,
        RushConstants.rushTempNpmScope,
        unscopedTempProjectName
      );

      commonProjectPackage = NpmPackage.createVirtualTempPackage(packageJsonFilename, installFolderName);

      // remove the extracted tarball contents
      FileSystem.deleteFile(packageJsonFilename);
      FileSystem.deleteFile(extractedFolder);

      commonRootPackage.addChild(commonProjectPackage);
    }

    // TODO: Validate that the project's package.json still matches the common folder
    const localProjectPackage: NpmPackage = NpmPackage.createLinkedNpmPackage(
      project.packageJsonEditor.name,
      commonProjectPackage.version,
      commonProjectPackage.dependencies,
      project.projectFolder
    );

    const queue: IQueueItem[] = [];
    queue.push({
      commonPackage: commonProjectPackage,
      localPackage: localProjectPackage,
      cyclicSubtreeRoot: undefined
    });

    for (;;) {
      const queueItem: IQueueItem | undefined = queue.shift();
      if (!queueItem) {
        break;
      }

      // A project from somewhere under "common/temp/node_modules"
      const commonPackage: NpmPackage = queueItem.commonPackage;

      // A symlinked virtual package somewhere under "this-project/node_modules",
      // where "this-project" corresponds to the "project" parameter for linkProject().
      const localPackage: NpmPackage = queueItem.localPackage;

      // If we encounter a dependency listed in cyclicDependencyProjects, this will be set to the root
      // of the localPackage subtree where we will stop creating local links.
      const cyclicSubtreeRoot: NpmPackage | undefined = queueItem.cyclicSubtreeRoot;

      // NOTE: It's important that this traversal follows the dependencies in the Common folder,
      // because for Rush projects this will be the union of
      // devDependencies / dependencies / optionalDependencies.
      for (const dependency of commonPackage.dependencies) {
        let startingCyclicSubtree: boolean = false;

        // Should this be a "local link" to a top-level Rush project (i.e. versus a regular link
        // into the Common folder)?
        const matchedRushPackage:
          | RushConfigurationProject
          | undefined = this._rushConfiguration.getProjectByName(dependency.name);

        if (matchedRushPackage) {
          const matchedVersion: string = matchedRushPackage.packageJsonEditor.version;

          // The dependency name matches an Rush project, but are there any other reasons not
          // to create a local link?
          if (cyclicSubtreeRoot) {
            // DO NOT create a local link, because this is part of an existing
            // cyclicDependencyProjects subtree
          } else if (project.cyclicDependencyProjects.has(dependency.name)) {
            // DO NOT create a local link, because we are starting a new
            // cyclicDependencyProjects subtree
            startingCyclicSubtree = true;
          } else if (
            dependency.kind !== PackageDependencyKind.LocalLink &&
            !semver.satisfies(matchedVersion, dependency.versionRange)
          ) {
            // DO NOT create a local link, because the local project's version isn't SemVer compatible.

            // (Note that in order to make version bumping work as expected, we ignore SemVer for
            // immediate dependencies of top-level projects, indicated by PackageDependencyKind.LocalLink.
            // Is this wise?)

            console.log(
              colors.yellow(
                `Rush will not locally link ${dependency.name} for ${localPackage.name}` +
                  ` because the requested version "${dependency.versionRange}" is incompatible` +
                  ` with the local version ${matchedVersion}`
              )
            );
          } else {
            // Yes, it is compatible, so create a symlink to the Rush project.
            // Is the dependency already resolved?
            const resolution: IResolveOrCreateResult = localPackage.resolveOrCreate(dependency.name);

            if (!resolution.found || resolution.found.version !== matchedVersion) {
              // We did not find a suitable match, so place a new local package that
              // symlinks to the Rush project
              const newLocalFolderPath: string = path.join(
                resolution.parentForCreate!.folderPath,
                'node_modules',
                dependency.name
              );

              const newLocalPackage: NpmPackage = NpmPackage.createLinkedNpmPackage(
                dependency.name,
                matchedVersion,
                // Since matchingRushProject does not have a parent, its dependencies are
                // guaranteed to be already fully resolved inside its node_modules folder.
                [],
                newLocalFolderPath
              );

              newLocalPackage.symlinkTargetFolderPath = matchedRushPackage.projectFolder;

              resolution.parentForCreate!.addChild(newLocalPackage);

              // (There are no dependencies, so we do not need to push it onto the queue.)
            }

            continue;
          }
        }

        // We can't symlink to an Rush project, so instead we will symlink to a folder
        // under the "Common" folder
        const commonDependencyPackage: NpmPackage | undefined = commonPackage.resolve(dependency.name);
        if (commonDependencyPackage) {
          // This is the version that was chosen when "npm install" ran in the common folder
          const effectiveDependencyVersion: string | undefined = commonDependencyPackage.version;

          // Is the dependency already resolved?
          let resolution: IResolveOrCreateResult;
          if (!cyclicSubtreeRoot || !matchedRushPackage) {
            // Perform normal module resolution.
            resolution = localPackage.resolveOrCreate(dependency.name);
          } else {
            // We are inside a cyclicDependencyProjects subtree (i.e. cyclicSubtreeRoot != undefined),
            // and the dependency is a local project (i.e. matchedRushPackage != undefined), so
            // we use a special module resolution strategy that places everything under the
            // cyclicSubtreeRoot.
            resolution = localPackage.resolveOrCreate(dependency.name, cyclicSubtreeRoot);
          }

          if (!resolution.found || resolution.found.version !== effectiveDependencyVersion) {
            // We did not find a suitable match, so place a new local package

            const newLocalFolderPath: string = path.join(
              resolution.parentForCreate!.folderPath,
              'node_modules',
              commonDependencyPackage.name
            );

            const newLocalPackage: NpmPackage = NpmPackage.createLinkedNpmPackage(
              commonDependencyPackage.name,
              commonDependencyPackage.version,
              commonDependencyPackage.dependencies,
              newLocalFolderPath
            );

            const commonPackageFromLookup: NpmPackage | undefined = commonPackageLookup.getPackage(
              newLocalPackage.nameAndVersion
            ) as NpmPackage;
            if (!commonPackageFromLookup) {
              throw new Error(
                `The ${localPackage.name}@${localPackage.version} package was not found` +
                  ` in the common folder`
              );
            }
            newLocalPackage.symlinkTargetFolderPath = commonPackageFromLookup.folderPath;

            let newCyclicSubtreeRoot: NpmPackage | undefined = cyclicSubtreeRoot;
            if (startingCyclicSubtree) {
              // If we are starting a new subtree, then newLocalPackage will be its root
              // NOTE: cyclicSubtreeRoot is guaranteed to be undefined here, since we never start
              // a new tree inside an existing tree
              newCyclicSubtreeRoot = newLocalPackage;
            }

            resolution.parentForCreate!.addChild(newLocalPackage);
            queue.push({
              commonPackage: commonDependencyPackage,
              localPackage: newLocalPackage,
              cyclicSubtreeRoot: newCyclicSubtreeRoot
            });
          }
        } else {
          if (dependency.kind !== PackageDependencyKind.Optional) {
            throw new Error(
              `The dependency "${dependency.name}" needed by "${localPackage.name}"` +
                ` was not found in the common folder -- do you need to run "rush install"?`
            );
          } else {
            console.log('Skipping optional dependency: ' + dependency.name);
          }
        }
      }
    }

    // When debugging, you can uncomment this line to dump the data structure
    // to the console:
    // localProjectPackage.printTree();

    NpmLinkManager._createSymlinksForTopLevelProject(localProjectPackage);

    // Also symlink the ".bin" folder
    if (localProjectPackage.children.length > 0) {
      const commonBinFolder: string = path.join(
        this._rushConfiguration.commonTempFolder,
        'node_modules',
        '.bin'
      );
      const projectBinFolder: string = path.join(localProjectPackage.folderPath, 'node_modules', '.bin');

      if (FileSystem.exists(commonBinFolder)) {
        NpmLinkManager._createSymlink({
          linkTargetPath: commonBinFolder,
          newLinkPath: projectBinFolder,
          symlinkKind: SymlinkKind.Directory
        });
      }
    }
  }
}
