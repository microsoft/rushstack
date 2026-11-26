// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import JSZip from 'jszip';

import { FileSystem, type FileSystemStats, Path } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { TarExecutable } from './TarExecutable';
import { TarArchive } from './TarArchive';

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
  data: Buffer | string;
  permissions: number;
  isSymbolicLink: boolean;
}

export interface ICreateArchiveOptions {
  terminal: ITerminal;
  /** Omit when assets have not been materialized, such as archive-only deployment. */
  sourceFolder?: string;
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
    const { filePath, fileData, archivePath } = options;

    let data: Buffer | string;
    let permissions: number;
    let isSymbolicLink: boolean = false;
    if (filePath) {
      const stats: FileSystemStats = options.stats ?? (await FileSystem.getLinkStatisticsAsync(filePath));
      if (stats.isSymbolicLink()) {
        data = await FileSystem.readLinkAsync(filePath);
        permissions = SYMBOLIC_LINK_PERMISSIONS;
        isSymbolicLink = true;
      } else if (stats.isDirectory()) {
        throw new Error('Directories cannot be added to the archive');
      } else {
        data = await FileSystem.readFileToBufferAsync(filePath);
        permissions = stats.mode;
      }
    } else if (fileData) {
      data = fileData;
      permissions = DEFAULT_FILE_PERMISSIONS;
    } else {
      throw new Error('Either filePath or fileData must be provided');
    }

    // Replace backslashes for Unix compat
    const addPath: string = Path.convertToSlashes(archivePath);
    this.#entries.set(addPath, { data, permissions, isSymbolicLink });
  }

  public async createArchiveAsync(archiveFilePath: string, options?: ICreateArchiveOptions): Promise<void> {
    if (this.#archiveFormat === 'zip') {
      const zip: JSZip = new JSZip();
      for (const [archivePath, { data, permissions }] of this.#entries) {
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
      const { terminal, sourceFolder } = options ?? {};
      const nativePathsSupported: boolean = [...this.#entries.keys()].every(
        (entryPath) => !entryPath.startsWith('-') && !/[\r\n\\]/.test(entryPath)
      );
      if (terminal && sourceFolder && nativePathsSupported) {
        const tarExecutable: TarExecutable | undefined = await TarExecutable.tryInitializeAsync(terminal);
        if (tarExecutable) {
          const logFilePath: string = `${archiveFilePath}.log`;
          const exitCode: number = await tarExecutable.tryCreateArchiveAsync({
            archivePath: archiveFilePath,
            paths: [...this.#entries.keys()],
            baseFolderPath: sourceFolder,
            logFilePath,
            gzip: this.#archiveFormat === 'tgz'
          });
          if (exitCode === 0) {
            await FileSystem.deleteFileAsync(logFilePath);
            return;
          }

          terminal.writeWarningLine(
            `Native tar exited with code ${exitCode}; falling back to JavaScript. See "${logFilePath}".`
          );
        } else {
          terminal.writeVerboseLine('Native tar is unavailable; falling back to JavaScript.');
        }
      } else {
        terminal?.writeVerboseLine(
          'Using JavaScript tar for in-memory assets or paths incompatible with native tar file lists.'
        );
      }

      await TarArchive.createFromEntriesAsync(
        { archivePath: archiveFilePath, gzip: this.#archiveFormat === 'tgz' },
        [...this.#entries].map(([archivePath, entry]) => ({ archivePath, ...entry }))
      );
    }
  }
}
