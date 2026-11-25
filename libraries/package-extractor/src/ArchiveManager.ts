// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { pipeline } from 'node:stream/promises';

import JSZip from 'jszip';
import * as tar from 'tar';

import {
  FileSystem,
  type FileSystemStats,
  type FileSystemWriteStream,
  Path
} from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { TarExecutable } from './TarExecutable';

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
  readonly #archiveFormat: 'zip' | 'tar' | 'tgz';
  readonly #entries: Map<string, IArchiveEntry> = new Map();

  public constructor(archiveFilePath: string) {
    if (archiveFilePath.endsWith('.zip')) {
      this.#archiveFormat = 'zip';
    } else if (archiveFilePath.endsWith('.tar')) {
      this.#archiveFormat = 'tar';
    } else if (archiveFilePath.endsWith('.tar.gz') || archiveFilePath.endsWith('.tgz')) {
      this.#archiveFormat = 'tgz';
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

      const pack: tar.Pack = new tar.Pack({ gzip: this.#archiveFormat === 'tgz' });
      const output: FileSystemWriteStream = await FileSystem.createWriteStreamAsync(archiveFilePath);
      const archivePromise: Promise<void> = pipeline(pack, output);

      for (const [archivePath, { data, permissions, isSymbolicLink }] of this.#entries) {
        const content: Buffer = isSymbolicLink
          ? Buffer.alloc(0)
          : typeof data === 'string'
            ? Buffer.from(data)
            : data;
        // ReadEntry allows generated assets to be archived without staging them on disk.
        const entry: tar.ReadEntry = new tar.ReadEntry(
          new tar.Header({
            path: archivePath,
            mode: permissions,
            type: isSymbolicLink ? 'SymbolicLink' : 'File',
            linkpath: isSymbolicLink ? Path.convertToSlashes(data.toString()) : undefined,
            size: content.length
          })
        );
        pack.add(entry);
        entry.end(content);
      }

      pack.end();
      await archivePromise;
    }
  }
}
