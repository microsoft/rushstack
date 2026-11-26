// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import JSZip from 'jszip';

import { Async, FileSystem, type FileSystemStats, Path } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { TarExecutable } from './TarExecutable';
import { MAX_CONCURRENCY } from './scripts/createLinks/utilities/constants';

export type ArchiveFormat = 'zip' | 'tar' | 'tgz';

// 755 are default permissions to allow read/write/execute for owner and read/execute for group and others.
const DEFAULT_FILE_PERMISSIONS: number = 0o755;
// This value sets the allowed permissions when preserving symbolic links.
// 120000 is the symbolic link identifier, and is OR'd with the default file permissions.
// See: https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/include/uapi/linux/stat.h#n10
// eslint-disable-next-line no-bitwise
const SYMBOLIC_LINK_PERMISSIONS: number = 0o120000 | DEFAULT_FILE_PERMISSIONS;

export interface IAddToArchiveOptions {
  filePath: string;
  archivePath: string;
  stats?: FileSystemStats;
}

export interface ICreateArchiveOptions {
  terminal: ITerminal;
  sourceFolder: string;
}

export class ArchiveManager {
  readonly #archiveFormat: ArchiveFormat;
  readonly #entries: Map<string, IAddToArchiveOptions> = new Map();
  #tarExecutablePromise: Promise<TarExecutable | undefined> | undefined;

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
    const { archivePath } = options;
    const addPath: string = Path.convertToSlashes(archivePath);
    if (path.isAbsolute(addPath) || addPath.split('/').includes('..')) {
      throw new Error('Archive entries must be relative paths within the archive');
    }

    this.#entries.set(addPath, options);
  }

  public async createArchiveAsync(archiveFilePath: string, options?: ICreateArchiveOptions): Promise<void> {
    if (this.#archiveFormat === 'zip') {
      const zip: JSZip = new JSZip();
      const entries: { archivePath: string; data: Buffer | string; permissions: number }[] =
        await Async.mapAsync(
          this.#entries,
          async ([archivePath, { filePath, stats: providedStats }]) => {
            let data: Buffer | string;
            let permissions: number;
            const stats: FileSystemStats =
              providedStats ?? (await FileSystem.getLinkStatisticsAsync(filePath));
            if (stats.isSymbolicLink()) {
              data = await FileSystem.readLinkAsync(filePath);
              permissions = SYMBOLIC_LINK_PERMISSIONS;
            } else if (stats.isDirectory()) {
              throw new Error('Directories cannot be added to the archive');
            } else {
              data = await FileSystem.readFileToBufferAsync(filePath);
              permissions = stats.mode;
            }

            return { archivePath, data, permissions };
          },
          { concurrency: MAX_CONCURRENCY }
        );
      for (const { archivePath, data, permissions } of entries) {
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
        throw new Error('Native tar creation requires terminal and source folder options');
      }

      const { terminal, sourceFolder } = options;
      const tarExecutable: TarExecutable | undefined = await (this.#tarExecutablePromise ??=
        TarExecutable.tryInitializeAsync(terminal));
      if (!tarExecutable) {
        throw new Error('Native tar is required to create tar archives. Ensure "tar" is on PATH.');
      }

      const logFilePath: string = `${archiveFilePath}.log`;
      const exitCode: number = await tarExecutable.tryCreateArchiveAsync({
        archivePath: archiveFilePath,
        paths: [...this.#entries.keys()],
        baseFolderPath: sourceFolder,
        logFilePath,
        gzip: this.#archiveFormat === 'tgz'
      });
      if (exitCode !== 0) {
        await FileSystem.deleteFileAsync(archiveFilePath);
        throw new Error(`Native tar exited with code ${exitCode}. See "${logFilePath}" for details.`);
      } else {
        await FileSystem.deleteFileAsync(logFilePath);
      }
    }
  }
}
