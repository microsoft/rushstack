/**
 * @file ExecuteLink.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * For each project, replaces node_modules with links to the modules in the common project.
 * Additionally, adds symlinks for projects with interdependencies.
 */

import * as del from 'del';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import readPackageTree = require('read-package-tree');

import JsonFile from './JsonFile';
import RushConfig from './RushConfig';
import RushConfigProject from './RushConfigProject';
import Package from './Package';
import PackageLookup from './PackageLookup';
import { performance_now, createFolderWithRetry } from './Utilities';

export interface IExecuteLinkOptions {
  noLocalLinks?: boolean;
}

interface IRushLinkJson {
  localLinks: {
    [name: string]: string[]
  };
}

interface IQueueItem {
  commonPackage: Package;
  localPackage: Package;
}

function createSymlinks(localPackage: Package): void {
  const localModuleFolder: string = path.join(localPackage.folderPath, 'node_modules');

  if (!localPackage.parent) {
    // The root-level folder is the project itself, so we simply delete its node_modules
    // to start clean
    console.log('Purging ' + localModuleFolder);
    del.sync(localModuleFolder, { force: true });
    console.log('Done');
  } else {
    if (!localPackage.symlinkTargetFolderPath) {
      // Program bug
      throw Error('localPackage.symlinkTargetFolderPath was not assigned');
    }

    // This is special case for when localPackage.name has the form '@scope/name',
    // in which case we need to create the '@scope' folder first.
    const parentFolderPath: string = path.dirname(localPackage.folderPath);
    if (parentFolderPath && parentFolderPath !== localPackage.folderPath) {
      if (!fs.existsSync(parentFolderPath)) {
        createFolderWithRetry(parentFolderPath);
      }
    }

    if (localPackage.children.length === 0) {
      // If there are no children, then we can symlink the entire folder
      fs.symlinkSync(localPackage.symlinkTargetFolderPath, localPackage.folderPath, 'junction');
    } else {
      // If there are children, then we need to symlink each item in the folder individually
      createFolderWithRetry(localPackage.folderPath);

      for (let filename of fs.readdirSync(localPackage.symlinkTargetFolderPath)) {
        if (filename.toLowerCase() !== 'node_modules') {
          // Create the symlink
          let linkType: string = 'file';

          const linkFrom: string = path.join(localPackage.folderPath, filename);
          let linkTo: string = path.join(localPackage.symlinkTargetFolderPath, filename);

          const linkStats: fs.Stats = fs.lstatSync(linkTo);

          if (linkStats.isSymbolicLink()) {
            const targetStats: fs.Stats = fs.statSync(linkTo);
            if (targetStats.isDirectory()) {
              // Neither a junction nor a directory-symlink can have a directory-symlink
              // as its target; instead, we must obtain the real physical path.
              // A junction can link to another junction.  Unfortunately, the node 'fs' API
              // lacks the ability to distinguish between a junction and a directory-symlink
              // (even though it has the ability to create them both), so the safest policy
              // is to always make a junction and always to the real physical path.
              linkTo = fs.realpathSync(linkTo);
              linkType = 'junction';
            }
          } else if (linkStats.isDirectory()) {
            linkType = 'junction';
          }

          fs.symlinkSync(linkTo, linkFrom, linkType);
        }
      }
    }
  }

  if (localPackage.children.length > 0) {
    createFolderWithRetry(localModuleFolder);

    for (let child of localPackage.children) {
      createSymlinks(child);
    }
  }
}

function linkProject(project: RushConfigProject, commonRootPackage: Package,
  commonPackageLookup: PackageLookup, rushConfig: RushConfig, rushLinkJson: IRushLinkJson,
  options: IExecuteLinkOptions): void {

  const commonProjectPackage: Package = commonRootPackage.getChildByName(project.tempProjectName);
  if (!commonProjectPackage) {
    throw new Error(`Unable to find a temp package for ${project.packageName} `
      + `-- you may need to run "rush update" again`);
  }

  // TODO: Validate that the project's package.json still matches the common folder
  const localProjectPackage = new Package(
    project.packageJson.name,
    commonProjectPackage.version,
    commonProjectPackage.dependencies,
    project.projectFolder
  );

  let queue: IQueueItem[] = [];
  queue.push({ commonPackage: commonProjectPackage, localPackage: localProjectPackage });

  while (true) {
    const queueItem: IQueueItem = queue.shift();
    if (!queueItem) {
      break;
    }

    const commonPackage: Package = queueItem.commonPackage;
    const localPackage: Package = queueItem.localPackage;

    // NOTE: It's important that we use the dependencies from the Common folder,
    // because for Rush projects this will be the union of
    // devDependencies / dependencies / optionalDependencies.
    for (let dependency of commonPackage.dependencies) {

      // Should this be a symlink to an Rush project?
      const matchedRushPackage: RushConfigProject = rushConfig.getProjectByName(dependency.name);
      if (matchedRushPackage && !options.noLocalLinks) {
        // The dependency name matches an Rush project, but is it compatible with
        // the requested version?
        const matchedVersion: string = matchedRushPackage.packageJson.version;
        if (semver.satisfies(matchedVersion, dependency.versionRange)) {
          // Yes, it is compatible, so create a symlink to the Rush project.

          // If the link is coming from our top-level Rush project, then record a
          // build dependency in rush-link.json:
          if (localPackage === localProjectPackage) {
            let localLinks: string[] = rushLinkJson.localLinks[localPackage.name];
            if (!localLinks) {
              localLinks = [];
              rushLinkJson.localLinks[localPackage.name] = localLinks;
            }
            localLinks.push(dependency.name);
          }

          // Is the dependency already resolved?
          const resolution = localPackage.resolveOrCreate(dependency.name);

          if (!resolution.found || resolution.found.version !== matchedVersion) {
            // We did not find a suitable match, so place a new local package that
            // symlinks to the Rush project
            const newLocalFolderPath: string = path.join(
              resolution.parentForCreate.folderPath, 'node_modules', dependency.name);

            const newLocalPackage: Package = new Package(
              dependency.name,
              matchedVersion,
              // Since matchingRushProject does not have a parent, its dependencies are
              // guaranteed to be already fully resolved inside its node_modules folder.
              [],
              newLocalFolderPath
            );

            newLocalPackage.symlinkTargetFolderPath = matchedRushPackage.projectFolder;

            resolution.parentForCreate.addChild(newLocalPackage);

            // (There are no dependencies, so we do not need to push it onto the queue.)
          }

          continue;
        } else {
          console.log(`Rush will not link ${dependency.name} for ${localPackage.name}`
            + ` because it requested version "${dependency.versionRange}" which is incompatible`
            + ` with version ${matchedVersion }`);
        }
      }

      // We can't symlink to an Rush project, so instead we will symlink to a folder
      // under the "Common" folder
      const commonDependencyPackage = commonPackage.resolve(dependency.name);
      if (commonDependencyPackage) {
        // This is the version that was chosen when "npm install" ran in the common folder
        const effectiveDependencyVersion = commonDependencyPackage.version;

        // Is the dependency already resolved?
        const resolution = localPackage.resolveOrCreate(dependency.name);

        if (!resolution.found || resolution.found.version !== effectiveDependencyVersion) {
          // We did not find a suitable match, so place a new local package

          const newLocalFolderPath: string = path.join(
            resolution.parentForCreate.folderPath, 'node_modules', commonDependencyPackage.name);

          const newLocalPackage: Package = new Package(
            commonDependencyPackage.name,
            commonDependencyPackage.version,
            commonDependencyPackage.dependencies,
            newLocalFolderPath
          );

          let commonPackage: Package = commonPackageLookup.getPackage(newLocalPackage.nameAndVersion);
          if (!commonPackage) {
            throw Error(`The ${localPackage.name}@${localPackage.version} package was not found in the Common folder`);
          }
          newLocalPackage.symlinkTargetFolderPath = commonPackage.folderPath;

          resolution.parentForCreate.addChild(newLocalPackage);
          queue.push({ commonPackage: commonDependencyPackage, localPackage: newLocalPackage });
        }
      } else {
        if (!dependency.isOptional) {
          throw Error(`The dependency "${dependency.name}" needed by "${localPackage.name}"`
            + ` was not found the Common folder`);
        } else {
          console.log('Skipping optional dependency: ' + dependency.name);
        }
      }
    }
  }

  // localProjectPackage.printTree();

  createSymlinks(localProjectPackage);

  // Also symlink the ".bin" folder
  if (localProjectPackage.children.length > 0) {
    const commonBinFolder: string = path.join(rushConfig.commonFolder, 'node_modules', '.bin');
    const projectBinFolder: string = path.join(localProjectPackage.folderPath, 'node_modules', '.bin');

    if (fs.existsSync(commonBinFolder)) {
      fs.symlinkSync(commonBinFolder, projectBinFolder, 'junction');
    }
  }
}

/**
 * Entry point for the "rush link" and "rush unlink" commands.
 */
export default function executeLink(rushConfig: RushConfig, options: IExecuteLinkOptions): void {
  const startTime: number = performance_now();

  const promise: Promise<PackageNode> = new Promise((resolve, reject) => {
    readPackageTree(rushConfig.commonFolder, (error: Error, rootNode: PackageNode) => {
      if (error) {
        reject(error);
      } else {
        resolve(rootNode);
      }
    });
  });
  promise.then((npmPackage: PackageNode) => {
    const commonRootPackage = Package.createFromNpm(npmPackage);
    // commonRootPackage.printTree();

    const commonPackageLookup: PackageLookup = new PackageLookup();
    commonPackageLookup.loadTree(commonRootPackage);

    let rushLinkJson: IRushLinkJson = { localLinks: {} };

    for (let project of rushConfig.projects) {
      console.log('\nLINKING: ' + project.packageName);
      linkProject(project, commonRootPackage, commonPackageLookup, rushConfig, rushLinkJson,
        options);
    }

    let rushLinkJsonFilename = path.join(rushConfig.commonFolder, 'rush-link.json');
    console.log(`Writing "${rushLinkJsonFilename}"`);
    JsonFile.saveJsonFile(rushLinkJson, rushLinkJsonFilename);

    const endTime: number = performance_now();
    const totalSeconds = (endTime - startTime) / 1000.0;
    console.log(os.EOL + `Done! Total Time: ${totalSeconds} secs`);

  }).catch((error: any) => {
    console.error(os.EOL + 'ERROR: ' + error.message);
  });
};
