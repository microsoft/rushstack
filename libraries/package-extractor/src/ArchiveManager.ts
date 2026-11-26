// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';
import path from 'node:path';

import JSZip from 'jszip';

import { FileSystem, type FileSystemStats, Path, type PosixModeBits } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { TarExecutable } from './TarExecutable';

export type ArchiveFormat = 'zip' | 'tar' | 'tgz';

// 755 are default permissions to allow read/write/execute for owner and read/execute for group and others.
const DEFAULT_FILE_PERMISSIONS: number = 0o755;
// This value sets the allowed permissions when preserving symbolic links.
// 120000 is the symbolic link identifier, and is OR'd with the default file permissions.
// See: https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/include/uapi/linux/stat.h#n10
// eslint-disable-next-line no-bitwise
const SYMBOLIC_LINK_PERMISSIONS: number = 0o120000 | DEFAULT_FILE_PERMISSIONS;

export interface IAddToArchiveOptions {
  filePath?: string;
  fileData?: Buffer | string;
  archivePath: string;
  stats?: FileSystemStats;
}

interface IArchiveEntry {
  filePath?: string;
  fileData?: Buffer | string;
  stats?: FileSystemStats;
}

export interface ICreateArchiveOptions {
  terminal: ITerminal;
  /** Omit when assets have not been materialized, such as archive-only deployment. */
  sourceFolder?: string;
  tempFolder: string;
}

export class ArchiveManager {
  readonly #archiveFormat: ArchiveFormat;
  readonly #entries: Map<string, IArchiveEntry> = new Map();

  public constructor(archiveFormat: ArchiveFormat) {
    this.#archiveFormat = archiveFormat;
  }

  public static getArchiveFormat(archiveFilePath: string): ArchiveFormat {
    if (archiveFilePath.endsWith('.zip')) {
      return 'zip';
    } else if (archiveFilePath.endsWith('.tar')) {
      return 'tar';
    } else if (archiveFilePath.endsWith('.tar.gz') || archiveFilePath.endsWith('.tgz')) {
      return 'tgz';
    } else {
      throw new Error('Supported archive file extensions: .zip, .tar, .tar.gz, .tgz.');
    }
  }

  public async addToArchiveAsync(options: IAddToArchiveOptions): Promise<void> {
    const { filePath, fileData, archivePath, stats } = options;
    if (!filePath && fileData === undefined) {
      throw new Error('Either filePath or fileData must be provided');
    }

    const addPath: string = Path.convertToSlashes(archivePath);
    if (path.isAbsolute(addPath) || addPath.split('/').includes('..')) {
      throw new Error('Archive entries must be relative paths within the archive');
    }

    this.#entries.set(addPath, { filePath, fileData, stats });
  }

  public async createArchiveAsync(archiveFilePath: string, options?: ICreateArchiveOptions): Promise<void> {
    if (this.#archiveFormat === 'zip') {
      const zip: JSZip = new JSZip();
      for (const [archivePath, { filePath, fileData, stats: providedStats }] of this.#entries) {
        let data: Buffer | string = fileData ?? '';
        let permissions: number = DEFAULT_FILE_PERMISSIONS;
        if (filePath) {
          const stats: FileSystemStats = providedStats ?? (await FileSystem.getLinkStatisticsAsync(filePath));
          if (stats.isSymbolicLink()) {
            data = await FileSystem.readLinkAsync(filePath);
            permissions = SYMBOLIC_LINK_PERMISSIONS;
          } else if (stats.isDirectory()) {
            throw new Error('Directories cannot be added to the archive');
          } else {
            data = await FileSystem.readFileToBufferAsync(filePath);
            permissions = stats.mode;
          }
        }

        zip.file(archivePath, data, {
          unixPermissions: permissions,
          dir: false
        });
      }

      const zipContent: Buffer = await zip.generateAsync({
        type: 'nodebuffer',
        platform: 'UNIX'
      });
      await FileSystem.writeFileAsync(archiveFilePath, zipContent);
    } else {
      if (!options) {
        throw new Error('Native tar creation requires terminal and temporary folder options');
      }

      const { terminal, sourceFolder, tempFolder } = options;
      const tarExecutable: TarExecutable | undefined = await TarExecutable.tryInitializeAsync(terminal);
      if (!tarExecutable) {
        throw new Error('Native tar is required to create tar archives. Ensure "tar" is on PATH.');
      }

      const archiveSourceFolder: string =
        sourceFolder ?? path.resolve(tempFolder, `deploy-archive-${randomUUID()}`);
      const logFilePath: string = `${archiveFilePath}.log`;
      try {
        if (!sourceFolder) {
          await FileSystem.ensureFolderAsync(archiveSourceFolder);
          for (const [archivePath, { filePath, fileData, stats: providedStats }] of this.#entries) {
            const stagedPath: string = path.resolve(archiveSourceFolder, archivePath);
            await FileSystem.ensureFolderAsync(path.dirname(stagedPath));
            if (filePath) {
              const stats: FileSystemStats =
                providedStats ?? (await FileSystem.getLinkStatisticsAsync(filePath));
              if (stats.isSymbolicLink()) {
                await FileSystem.createSymbolicLinkFileAsync({
                  newLinkPath: stagedPath,
                  linkTargetPath: await FileSystem.readLinkAsync(filePath)
                });
              } else if (stats.isDirectory()) {
                throw new Error('Directories cannot be added to the archive');
              } else {
                await FileSystem.copyFileAsync({ sourcePath: filePath, destinationPath: stagedPath });
              }
            } else {
              await FileSystem.writeFileAsync(stagedPath, fileData ?? '');
              await FileSystem.changePosixModeBitsAsync(
                stagedPath,
                DEFAULT_FILE_PERMISSIONS as PosixModeBits
              );
            }
          }
        }

        const exitCode: number = await tarExecutable.tryCreateArchiveAsync({
          archivePath: archiveFilePath,
          paths: [...this.#entries.keys()],
          baseFolderPath: archiveSourceFolder,
          logFilePath,
          gzip: this.#archiveFormat === 'tgz'
        });
        if (exitCode !== 0) {
          await FileSystem.deleteFileAsync(archiveFilePath);
          throw new Error(`Native tar exited with code ${exitCode}. See "${logFilePath}" for details.`);
        }

        await FileSystem.deleteFileAsync(logFilePath);
      } finally {
        if (!sourceFolder) {
          await FileSystem.deleteFolderAsync(archiveSourceFolder);
        }
      }
    }
  }
}
