/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as colors from 'colors';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import readPackageTree = require('read-package-tree');

import CommandLineAction from '../commandLine/CommandLineAction';
import JsonFile from '../utilities/JsonFile';
import RushCommandLineParser from './RushCommandLineParser';
import RushConfig, { IRushLinkJson } from '../data/RushConfig';
import RushConfigProject from '../data/RushConfigProject';
import Package from '../data/Package';
import PackageLookup from '../data/PackageLookup';
import Utilities from '../utilities/Utilities';
import { CommandLineFlagParameter } from '../commandLine/CommandLineParameter';

export default class LinkAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfig: RushConfig;
  private _noLocalLinksParameter: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'link',
      summary: 'Create node_modules symlinks for all projects',
      documentation: 'Create node_modules symlinks for all projects'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    this._noLocalLinksParameter = this.defineFlagParameter({
      parameterLongName: '--no-local-links',
      parameterShortName: '-n',
      description: 'Do not locally link the projects; always link to the common folder'
    });
  }

  protected onExecute(): void {
    this._rushConfig = this._rushConfig = RushConfig.loadFromDefaultLocation();

    console.log('Starting "rush link"');

    const options: IExecuteLinkOptions = {
      noLocalLinks: this._noLocalLinksParameter.value
    };

    readPackageTree(this._rushConfig.commonFolder, (error: Error, npmPackage: PackageNode) => {
      this._parser.trapErrors(() => {
        if (error) {
          throw error;
        } else {
          const commonRootPackage = Package.createFromNpm(npmPackage);

          const commonPackageLookup: PackageLookup = new PackageLookup();
          commonPackageLookup.loadTree(commonRootPackage);

          const rushLinkJson: IRushLinkJson = { localLinks: {} };

          for (const project of this._rushConfig.projects) {
            console.log(os.EOL + 'LINKING: ' + project.packageName);
            linkProject(project, commonRootPackage, commonPackageLookup, this._rushConfig, rushLinkJson,
              options);
          }

          console.log(`Writing "${this._rushConfig.rushLinkJsonFilename}"`);
          JsonFile.saveJsonFile(rushLinkJson, this._rushConfig.rushLinkJsonFilename);

          console.log(os.EOL + colors.green('Rush link finished successfully.'));
          console.log(os.EOL + 'Next you should probably run: "rush rebuild -q"');
        }
      });
    });
  }
}

interface IExecuteLinkOptions {
  noLocalLinks?: boolean;
}

interface IQueueItem {
  commonPackage: Package;
  localPackage: Package;
}

function createSymlink(linkTarget: string, linkSource: string, linkType: string): void {
  try {
    fs.symlinkSync(linkTarget, linkSource, linkType);
  } catch (error) {
    // If you try to create a regular file symlink, it appears to require Administrator
    // permissions.  Whereas if you create a junction, that seems to NOT require any
    // special permissions.
    throw new Error(error.message + os.EOL
      + '(You may need to do "Run As Administrator" when starting your command prompt.)');
  }
}

/**
 * This is a helper function used by createSymlinksForTopLevelProject().
 * It will recursively creates symlinked folders corresponding to each of the
 * Package objects in the provided tree.
 */
function createSymlinksForDependencies(localPackage: Package): void {
  const localModuleFolder: string = path.join(localPackage.folderPath, 'node_modules');

  if (!localPackage.symlinkTargetFolderPath) {
    // Program bug
    throw Error('localPackage.symlinkTargetFolderPath was not assigned');
  }

  // This is special case for when localPackage.name has the form '@scope/name',
  // in which case we need to create the '@scope' folder first.
  const parentFolderPath: string = path.dirname(localPackage.folderPath);
  if (parentFolderPath && parentFolderPath !== localPackage.folderPath) {
    if (!fs.existsSync(parentFolderPath)) {
      Utilities.createFolderWithRetry(parentFolderPath);
    }
  }

  if (localPackage.children.length === 0) {
    // If there are no children, then we can symlink the entire folder
    createSymlink(localPackage.symlinkTargetFolderPath, localPackage.folderPath, 'junction');
  } else {
    // If there are children, then we need to symlink each item in the folder individually
    Utilities.createFolderWithRetry(localPackage.folderPath);

    for (let filename of fs.readdirSync(localPackage.symlinkTargetFolderPath)) {
      if (filename.toLowerCase() !== 'node_modules') {
        // Create the symlink
        let linkType: string = 'file';

        const linkSource: string = path.join(localPackage.folderPath, filename);
        let linkTarget: string = path.join(localPackage.symlinkTargetFolderPath, filename);

        const linkStats: fs.Stats = fs.lstatSync(linkTarget);

        if (linkStats.isSymbolicLink()) {
          const targetStats: fs.Stats = fs.statSync(linkTarget);
          if (targetStats.isDirectory()) {
            // Neither a junction nor a directory-symlink can have a directory-symlink
            // as its target; instead, we must obtain the real physical path.
            // A junction can link to another junction.  Unfortunately, the node 'fs' API
            // lacks the ability to distinguish between a junction and a directory-symlink
            // (even though it has the ability to create them both), so the safest policy
            // is to always make a junction and always to the real physical path.
            linkTarget = fs.realpathSync(linkTarget);
            linkType = 'junction';
          }
        } else if (linkStats.isDirectory()) {
          linkType = 'junction';
        }

        createSymlink(linkTarget, linkSource, linkType);
      }
    }
  }

  if (localPackage.children.length > 0) {
    Utilities.createFolderWithRetry(localModuleFolder);

    for (let child of localPackage.children) {
      createSymlinksForDependencies(child);
    }
  }
}

/**
 * For a Package object that represents a top-level Rush project folder
 * (i.e. with source code that we will be building), this clears out its
 * node_modules folder and then recursively creates all the symlinked folders.
 */
function createSymlinksForTopLevelProject(localPackage: Package): void {
  const localModuleFolder: string = path.join(localPackage.folderPath, 'node_modules');

  // Sanity check
  if (localPackage.parent) {
    throw new Error('The provided package is not a top-level project');
  }

  // The root-level folder is the project itself, so we simply delete its node_modules
  // to start clean
  console.log('Purging ' + localModuleFolder);
  Utilities.dangerouslyDeletePath(localModuleFolder);
  console.log('Done');

  if (localPackage.children.length > 0) {
    Utilities.createFolderWithRetry(localModuleFolder);

    for (let child of localPackage.children) {
      createSymlinksForDependencies(child);
    }
  }
}

function linkProject(
  project: RushConfigProject,
  commonRootPackage: Package,
  commonPackageLookup: PackageLookup,
  rushConfig: RushConfig,
  rushLinkJson: IRushLinkJson,
  options: IExecuteLinkOptions): void {

  const commonProjectPackage: Package = commonRootPackage.getChildByName(project.tempProjectName);
  if (!commonProjectPackage) {
    throw new Error(`Unable to find a temp package for ${project.packageName} `
      + `-- you may need to run "rush prepare" again`);
  }

  // TODO: Validate that the project's package.json still matches the common folder
  const localProjectPackage = new Package(
    project.packageJson.name,
    commonProjectPackage.version,
    commonProjectPackage.dependencies,
    project.projectFolder
  );

  const queue: IQueueItem[] = [];
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
    for (const dependency of commonPackage.dependencies) {

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
            throw Error(`The ${localPackage.name}@${localPackage.version} package was not found`
              + ` in the ${rushConfig.commonFolderName} folder`);
          }
          newLocalPackage.symlinkTargetFolderPath = commonPackage.folderPath;

          resolution.parentForCreate.addChild(newLocalPackage);
          queue.push({ commonPackage: commonDependencyPackage, localPackage: newLocalPackage });
        }
      } else {
        if (!dependency.isOptional) {
          throw Error(`The dependency "${dependency.name}" needed by "${localPackage.name}"`
            + ` was not found the ${rushConfig.commonFolderName} folder`);
        } else {
          console.log('Skipping optional dependency: ' + dependency.name);
        }
      }
    }
  }

  // When debugging, you can uncomment this line to dump the data structure
  // to the console:
  // localProjectPackage.printTree();

  createSymlinksForTopLevelProject(localProjectPackage);

  // Also symlink the ".bin" folder
  if (localProjectPackage.children.length > 0) {
    const commonBinFolder: string = path.join(rushConfig.commonFolder, 'node_modules', '.bin');
    const projectBinFolder: string = path.join(localProjectPackage.folderPath, 'node_modules', '.bin');

    if (fs.existsSync(commonBinFolder)) {
      createSymlink(commonBinFolder, projectBinFolder, 'junction');
    }
  }
}
