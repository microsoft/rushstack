// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  default as RushConfiguration
} from '../../../data/RushConfiguration';
import Utilities from '../../../utilities/Utilities';
import { Stopwatch } from '../../../utilities/Stopwatch';
import { BasePackage } from './BasePackage';

export enum SymlinkKind {
  File,
  Directory
}

export abstract class BaseLinkManager {
  protected _rushConfiguration: RushConfiguration;

  protected static _createSymlink(linkTarget: string, linkSource: string, symlinkKind: SymlinkKind): void {
    fsx.mkdirsSync(path.dirname(linkSource));

    if (symlinkKind === SymlinkKind.Directory) {
      // For directories, we use a Windows "junction".  On Unix, this produces a regular symlink.
      fsx.symlinkSync(linkTarget, linkSource, 'junction');
    } else {
      if (process.platform === 'win32') {
        // For files, we use a Windows "hard link", because creating a symbolic link requires
        // administrator permission.
        fsx.linkSync(linkTarget, linkSource);
      } else {
        // However hard links seem to cause build failures on Mac, so for all other operating systems
        // we use symbolic links for this case.
        fsx.symlinkSync(linkTarget, linkSource, 'file');
      }
    }
  }

  /**
   * For a Package object that represents a top-level Rush project folder
   * (i.e. with source code that we will be building), this clears out its
   * node_modules folder and then recursively creates all the symlinked folders.
   */
  protected static _createSymlinksForTopLevelProject(localPackage: BasePackage): void {
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
        BaseLinkManager._createSymlinksForDependencies(child);
      }
    }
  }

  /**
   * This is a helper function used by createSymlinksForTopLevelProject().
   * It will recursively creates symlinked folders corresponding to each of the
   * Package objects in the provided tree.
   */
  private static _createSymlinksForDependencies(localPackage: BasePackage): void {
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
      BaseLinkManager._createSymlink(
        localPackage.symlinkTargetFolderPath,
        localPackage.folderPath,
        SymlinkKind.Directory);
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

          BaseLinkManager._createSymlink(linkTarget, linkSource, symlinkKind);
        }
      }
    }

    if (localPackage.children.length > 0) {
      Utilities.createFolderWithRetry(localModuleFolder);

      for (const child of localPackage.children) {
        BaseLinkManager._createSymlinksForDependencies(child);
      }
    }
  }

  constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  /**
   * Creates node_modules symlinks for all Rush projects defined in the RushConfiguration.
   * @param force - Normally the operation will be skipped if the links are already up to date;
   *   if true, this option forces the links to be recreated.
   */
  public createSymlinksForProjects(force: boolean): Promise<void> {
    if (!force) {
      if (fsx.existsSync(this._rushConfiguration.rushLinkJsonFilename)) {
        console.log(colors.green(`Skipping linking -- everything is already up to date.`));
        return Promise.resolve();
      }
    }

    console.log('Linking projects together...');
    const stopwatch: Stopwatch = Stopwatch.start();

    // Delete the flag file if it exists; if we get interrupted, this will ensure that
    // a full "rush link" is required next time
    Utilities.deleteFile(this._rushConfiguration.rushLinkJsonFilename);

    return this._linkProjects()
      .then(() => {
        stopwatch.stop();
        console.log(os.EOL + colors.green(`Linking finished successfully. (${stopwatch.toString()})`));
        console.log(os.EOL + 'Next you should probably run "rush build" or "rush rebuild"');
      });
  }

  protected abstract _linkProjects(): Promise<void>;
}
