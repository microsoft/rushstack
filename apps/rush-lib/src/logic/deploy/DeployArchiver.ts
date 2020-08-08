// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// eslint-disable-next-line @typescript-eslint/typedef
const importLazy = require('import-lazy')(require);

// eslint-disable-next-line @typescript-eslint/typedef
const JSZip = importLazy('jszip');

import * as path from 'path';
import { FileSystem, FileSystemStats } from '@rushstack/node-core-library';

import { IDeployState } from './DeployManager';

// JSZip is dependant on Blob being declared.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Blob = any;
}
export class DeployArchiver {
  public static async createArchiveAsync(deployState: IDeployState): Promise<void> {
    if (deployState.createArchiveFilePath !== undefined) {
      console.log('Creating archive...');
      // eslint-disable-next-line @typescript-eslint/typedef
      const zip = this._getZipOfFolder(deployState.targetRootFolder);
      const zipContent: Buffer = await zip.generateAsync({
        type: 'nodebuffer',
        platform: 'UNIX'
      });

      FileSystem.writeFile(
        path.resolve(deployState.targetRootFolder, deployState.createArchiveFilePath),
        zipContent
      );

      console.log('Archive created successfully.');
    }
  }

  private static _getFilePathsRecursively(dir: string): string[] {
    // returns a flat array of absolute paths of all files recursively contained in the dir
    let results: string[] = [];
    const list: string[] = FileSystem.readFolder(dir);

    if (!list.length) return results;

    for (let file of list) {
      file = path.resolve(dir, file);

      const stat: FileSystemStats = FileSystem.getLinkStatistics(file);

      if (stat && stat.isDirectory()) {
        results = results.concat(this._getFilePathsRecursively(file));
      } else {
        results.push(file);
      }
    }

    return results;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static _getZipOfFolder(dir: string): any {
    // returns a JSZip instance filled with contents of dir.
    const allPaths: string[] = this._getFilePathsRecursively(dir);

    // This value sets the allowed permissions when preserving symbolic links.
    // 120000 is the symbolic link identifier, and 0755 designates the allowed permissions.
    // See: https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/include/uapi/linux/stat.h#n10
    const permissionsValue: number = 0o120755;

    // eslint-disable-next-line @typescript-eslint/typedef
    const zip = new JSZip();
    for (const filePath of allPaths) {
      const addPath: string = path.relative(dir, filePath);
      const stat: FileSystemStats = FileSystem.getLinkStatistics(filePath);
      const permissions: number = stat.mode;

      if (stat.isSymbolicLink()) {
        zip.file(addPath, FileSystem.readLink(filePath), {
          unixPermissions: permissionsValue,
          dir: stat.isDirectory()
        });
      } else {
        const data: Buffer = FileSystem.readFileToBuffer(filePath);
        zip.file(addPath, data, {
          unixPermissions: permissions,
          dir: stat.isDirectory()
        });
      }
    }

    return zip;
  }
}
