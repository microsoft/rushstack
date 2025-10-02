// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  FileSystem,
  type FileSystemStats,
  type IFileSystemCreateLinkOptions,
  InternalError
} from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import type { RushConfiguration } from '../../api/RushConfiguration';
import { Utilities } from '../../utilities/Utilities';
import { Stopwatch } from '../../utilities/Stopwatch';
import type { BasePackage } from './BasePackage';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { RushConstants } from '../RushConstants';
import { FlagFile } from '../../api/FlagFile';

export enum SymlinkKind {
  File,
  Directory
}

export interface IBaseLinkManagerCreateSymlinkOptions extends IFileSystemCreateLinkOptions {
  symlinkKind: SymlinkKind;
}

export abstract class BaseLinkManager {
  protected _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public static async _createSymlinkAsync(options: IBaseLinkManagerCreateSymlinkOptions): Promise<void> {
    // TODO: Consider promoting this to node-core-library
    const newLinkFolder: string = path.dirname(options.newLinkPath);
    await FileSystem.ensureFolderAsync(newLinkFolder);

    let relativePathForbidden: boolean = false;
    let linkFunctionAsync: (options: IBaseLinkManagerCreateSymlinkOptions) => Promise<void>;

    if (process.platform === 'win32') {
      if (options.symlinkKind === SymlinkKind.Directory) {
        // For directories, we use a Windows "junction".  On Unix, this produces a regular symlink.
        linkFunctionAsync = FileSystem.createSymbolicLinkJunctionAsync.bind(FileSystem);
      } else {
        // For files, we use a Windows "hard link", because creating a symbolic link requires
        // administrator permission.
        linkFunctionAsync = FileSystem.createHardLinkAsync.bind(FileSystem);

        // NOTE: We cannot use the relative path for hard links
        relativePathForbidden = true;
      }
    } else {
      // However hard links seem to cause build failures on Mac, so for all other operating systems
      // we use symbolic links for this case.
      if (options.symlinkKind === SymlinkKind.Directory) {
        linkFunctionAsync = FileSystem.createSymbolicLinkFolderAsync.bind(FileSystem);
      } else {
        linkFunctionAsync = FileSystem.createSymbolicLinkFileAsync.bind(FileSystem);
      }
    }

    let { linkTargetPath } = options;
    if (!relativePathForbidden && !EnvironmentConfiguration.absoluteSymlinks) {
      // Link to the relative path, to avoid going outside containers such as a Docker image
      const newLinkFolderRealPath: string = await FileSystem.getRealPathAsync(newLinkFolder);
      linkTargetPath = path.relative(newLinkFolderRealPath, linkTargetPath);
    }

    await linkFunctionAsync({
      ...options,
      linkTargetPath
    });
  }

  /**
   * For a Package object that represents a top-level Rush project folder
   * (i.e. with source code that we will be building), this clears out its
   * node_modules folder and then recursively creates all the symlinked folders.
   */
  protected static async _createSymlinksForTopLevelProjectAsync(localPackage: BasePackage): Promise<void> {
    const localModuleFolder: string = path.join(localPackage.folderPath, 'node_modules');

    // Sanity check
    if (localPackage.parent) {
      throw new Error('The provided package is not a top-level project');
    }

    // The root-level folder is the project itself, so we simply delete its node_modules
    // to start clean
    // eslint-disable-next-line no-console
    console.log('Purging ' + localModuleFolder);
    Utilities.dangerouslyDeletePath(localModuleFolder);

    if (localPackage.children.length > 0) {
      Utilities.createFolderWithRetry(localModuleFolder);

      for (const child of localPackage.children) {
        await BaseLinkManager._createSymlinksForDependenciesAsync(child);
      }
    }
  }

  /**
   * This is a helper function used by createSymlinksForTopLevelProject().
   * It will recursively creates symlinked folders corresponding to each of the
   * Package objects in the provided tree.
   */
  private static async _createSymlinksForDependenciesAsync(localPackage: BasePackage): Promise<void> {
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
      await BaseLinkManager._createSymlinkAsync({
        linkTargetPath: localPackage.symlinkTargetFolderPath,
        newLinkPath: localPackage.folderPath,
        symlinkKind: SymlinkKind.Directory
      });
    } else {
      // If there are children, then we need to symlink each item in the folder individually
      Utilities.createFolderWithRetry(localPackage.folderPath);

      for (const filename of FileSystem.readFolderItemNames(localPackage.symlinkTargetFolderPath)) {
        if (filename.toLowerCase() !== 'node_modules') {
          // Create the symlink
          let symlinkKind: SymlinkKind = SymlinkKind.File;

          const linkSource: string = path.join(localPackage.folderPath, filename);
          let linkTarget: string = path.join(localPackage.symlinkTargetFolderPath, filename);

          const linkStats: FileSystemStats = FileSystem.getLinkStatistics(linkTarget);

          if (linkStats.isSymbolicLink()) {
            const targetStats: FileSystemStats = FileSystem.getStatistics(FileSystem.getRealPath(linkTarget));
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

          await BaseLinkManager._createSymlinkAsync({
            linkTargetPath: linkTarget,
            newLinkPath: linkSource,
            symlinkKind
          });
        }
      }
    }

    if (localPackage.children.length > 0) {
      Utilities.createFolderWithRetry(localModuleFolder);

      for (const child of localPackage.children) {
        await BaseLinkManager._createSymlinksForDependenciesAsync(child);
      }
    }
  }

  /**
   * Creates node_modules symlinks for all Rush projects defined in the RushConfiguration.
   * @param force - Normally the operation will be skipped if the links are already up to date;
   *   if true, this option forces the links to be recreated.
   */
  public async createSymlinksForProjectsAsync(force: boolean): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('\n' + Colorize.bold('Linking local projects'));
    const stopwatch: Stopwatch = Stopwatch.start();

    await this._linkProjectsAsync();

    // TODO: Remove when "rush link" and "rush unlink" are deprecated
    await new FlagFile(
      this._rushConfiguration.defaultSubspace.getSubspaceTempFolderPath(),
      RushConstants.lastLinkFlagFilename,
      {}
    ).createAsync();

    stopwatch.stop();
    // eslint-disable-next-line no-console
    console.log('\n' + Colorize.green(`Linking finished successfully. (${stopwatch.toString()})`));
    // eslint-disable-next-line no-console
    console.log('\nNext you should probably run "rush build" or "rush rebuild"');
  }

  protected abstract _linkProjectsAsync(): Promise<void>;
}
