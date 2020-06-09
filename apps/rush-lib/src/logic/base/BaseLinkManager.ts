// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { FileSystem, IFileSystemCreateLinkOptions, InternalError } from '@rushstack/node-core-library';

import { RushConfiguration } from '../../api/RushConfiguration';
import { Utilities } from '../../utilities/Utilities';
import { Stopwatch } from '../../utilities/Stopwatch';
import { BasePackage } from './BasePackage';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';

export enum SymlinkKind {
  File,
  Directory,
}

export interface IBaseLinkManagerCreateSymlinkOptions extends IFileSystemCreateLinkOptions {
  symlinkKind: SymlinkKind;
}

export abstract class BaseLinkManager {
  protected _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  protected static _createSymlink(options: IBaseLinkManagerCreateSymlinkOptions): void {
    const newLinkFolder: string = path.dirname(options.newLinkPath);
    FileSystem.ensureFolder(newLinkFolder);

    let targetPath: string;
    if (EnvironmentConfiguration.absoluteSymlinks) {
      targetPath = options.linkTargetPath;
    } else {
      // Link to the relative path, to avoid going outside containers such as a Docker image
      targetPath = path.relative(fs.realpathSync(newLinkFolder), options.linkTargetPath);
    }

    if (process.platform === 'win32') {
      if (options.symlinkKind === SymlinkKind.Directory) {
        // For directories, we use a Windows "junction".  On Unix, this produces a regular symlink.
        FileSystem.createSymbolicLinkJunction({
          linkTargetPath: targetPath,
          newLinkPath: options.newLinkPath,
        });
      } else {
        // For files, we use a Windows "hard link", because creating a symbolic link requires
        // administrator permission.

        // NOTE: We cannot use the relative path for hard links
        FileSystem.createHardLink({
          linkTargetPath: options.linkTargetPath,
          newLinkPath: options.newLinkPath,
        });
      }
    } else {
      // However hard links seem to cause build failures on Mac, so for all other operating systems
      // we use symbolic links for this case.
      if (options.symlinkKind === SymlinkKind.Directory) {
        FileSystem.createSymbolicLinkFolder({
          linkTargetPath: targetPath,
          newLinkPath: options.newLinkPath,
        });
      } else {
        FileSystem.createSymbolicLinkFile({
          linkTargetPath: targetPath,
          newLinkPath: options.newLinkPath,
        });
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
      throw new InternalError('localPackage.symlinkTargetFolderPath was not assigned');
    }

    // This is special case for when localPackage.name has the form '@scope/name',
    // in which case we need to create the '@scope' folder first.
    const parentFolderPath: string = path.dirname(localPackage.folderPath);
    if (parentFolderPath && parentFolderPath !== localPackage.folderPath) {
      if (!FileSystem.exists(parentFolderPath)) {
        Utilities.createFolderWithRetry(parentFolderPath);
      }
    }

    if (localPackage.children.length === 0) {
      // If there are no children, then we can symlink the entire folder
      BaseLinkManager._createSymlink({
        linkTargetPath: localPackage.symlinkTargetFolderPath,
        newLinkPath: localPackage.folderPath,
        symlinkKind: SymlinkKind.Directory,
      });
    } else {
      // If there are children, then we need to symlink each item in the folder individually
      Utilities.createFolderWithRetry(localPackage.folderPath);

      for (const filename of FileSystem.readFolder(localPackage.symlinkTargetFolderPath)) {
        if (filename.toLowerCase() !== 'node_modules') {
          // Create the symlink
          let symlinkKind: SymlinkKind = SymlinkKind.File;

          const linkSource: string = path.join(localPackage.folderPath, filename);
          let linkTarget: string = path.join(localPackage.symlinkTargetFolderPath, filename);

          const linkStats: fs.Stats = FileSystem.getLinkStatistics(linkTarget);

          if (linkStats.isSymbolicLink()) {
            const targetStats: fs.Stats = FileSystem.getStatistics(FileSystem.getRealPath(linkTarget));
            if (targetStats.isDirectory()) {
              // Neither a junction nor a directory-symlink can have a directory-symlink
              // as its target; instead, we must obtain the real physical path.
              // A junction can link to another junction.  Unfortunately, the node 'fs' API
              // lacks the ability to distinguish between a junction and a directory-symlink
              // (even though it has the ability to create them both), so the safest policy
              // is to always make a junction and always to the real physical path.
              linkTarget = FileSystem.getRealPath(linkTarget);
              symlinkKind = SymlinkKind.Directory;
            }
          } else if (linkStats.isDirectory()) {
            symlinkKind = SymlinkKind.Directory;
          }

          BaseLinkManager._createSymlink({
            linkTargetPath: linkTarget,
            newLinkPath: linkSource,
            symlinkKind,
          });
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

  /**
   * Creates node_modules symlinks for all Rush projects defined in the RushConfiguration.
   * @param force - Normally the operation will be skipped if the links are already up to date;
   *   if true, this option forces the links to be recreated.
   */
  public async createSymlinksForProjects(force: boolean): Promise<void> {
    if (!force) {
      if (FileSystem.exists(this._rushConfiguration.rushLinkJsonFilename)) {
        console.log(colors.green(`Skipping linking -- everything is already up to date.`));
        return;
      }
    }

    console.log('Linking projects together...');
    const stopwatch: Stopwatch = Stopwatch.start();

    // Delete the flag file if it exists; if we get interrupted, this will ensure that
    // a full "rush link" is required next time
    Utilities.deleteFile(this._rushConfiguration.rushLinkJsonFilename);

    await this._linkProjects();

    stopwatch.stop();
    console.log(os.EOL + colors.green(`Linking finished successfully. (${stopwatch.toString()})`));
    console.log(os.EOL + 'Next you should probably run "rush build" or "rush rebuild"');
  }

  protected abstract _linkProjects(): Promise<void>;
}
