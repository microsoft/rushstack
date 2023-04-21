// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import JSZip from 'jszip';
import { FileSystem, FileSystemStats, Path } from '@rushstack/node-core-library';

// This value sets the allowed permissions when preserving symbolic links.
// 120000 is the symbolic link identifier, and 0755 designates the allowed permissions.
// See: https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/include/uapi/linux/stat.h#n10
const SYMBOLIC_LINK_PERMISSIONS: number = 0o120755;

export interface IDeployArchiverOptions {
  archiveFilePath: string;
}

export interface IAddToArchiveOptions {
  filePath?: string;
  fileData?: Buffer | string;
  archivePath: string;
  stats?: FileSystemStats;
}

export class DeployArchiver {
  private _options: IDeployArchiverOptions;
  private _zip: JSZip;

  public constructor(options: IDeployArchiverOptions) {
    this._options = options;
    this._zip = new JSZip();
  }

  public get archiveFilePath(): string {
    return this._options.archiveFilePath;
  }

  public async addToArchiveAsync(options: IAddToArchiveOptions): Promise<void> {
    const { filePath, fileData, archivePath } = options;

    let data: Buffer | string;
    let permissions: number;
    if (filePath) {
      const stats: FileSystemStats = options.stats ?? (await FileSystem.getLinkStatisticsAsync(filePath));
      if (stats.isSymbolicLink()) {
        data = await FileSystem.readLinkAsync(filePath);
        permissions = SYMBOLIC_LINK_PERMISSIONS;
      } else if (stats.isDirectory()) {
        throw new Error('Directories cannot be added to the archive');
      } else {
        data = await FileSystem.readFileToBufferAsync(filePath);
        permissions = stats.mode;
      }
    } else if (fileData) {
      data = fileData;
      permissions = 0o000755;
    } else {
      throw new Error('Either filePath or fileData must be provided');
    }

    // Replace backslashes for Unix compat
    const addPath: string = Path.convertToSlashes(archivePath);
    this._zip.file(addPath, data, {
      unixPermissions: permissions,
      dir: false
    });
  }

  public async createArchiveAsync(): Promise<void> {
    const { archiveFilePath } = this._options;
    const zipContent: Buffer = await this._zip.generateAsync({
      type: 'nodebuffer',
      platform: 'UNIX'
    });
    await FileSystem.writeFileAsync(archiveFilePath, zipContent);
  }
}
