// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import fs from 'node:fs';

import { Async, FileSystem, Path, type FileSystemStats } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { ArchiveManager } from './ArchiveManager';
import type { IExtractorOptions, LinkCreationMode } from './PackageExtractor';
import type { ILinkInfo, SymlinkAnalyzer } from './SymlinkAnalyzer';
import { remapSourcePathForTargetFolder } from './Utils';

export interface IIncludeAssetOptions {
  sourceFilePath?: string;
  sourceFileStats?: FileSystemStats;
  sourceFileContent?: string | Buffer;
  targetFilePath: string;
  ignoreIfExisting?: boolean;
}

export interface IIncludeAssetPathOptions extends IIncludeAssetOptions {
  sourceFilePath: string;
  sourceFileContent?: never;
}

export interface IIncludeExistingAssetPathOptions extends IIncludeAssetOptions {
  sourceFilePath?: never;
  sourceFileContent?: never;
}

export interface IIncludeAssetContentOptions extends IIncludeAssetOptions {
  sourceFileContent: string | Buffer;
  sourceFilePath?: never;
  sourceFileStats?: never;
}

export interface IAssetHandlerOptions extends IExtractorOptions {
  symlinkAnalyzer: SymlinkAnalyzer;
}

export interface IFinalizeOptions {
  onAfterExtractSymlinksAsync: () => Promise<void>;
}

export class AssetHandler {
  readonly #terminal: ITerminal;
  readonly #sourceRootFolder: string;
  readonly #targetRootFolder: string;
  readonly #createArchiveOnly: boolean;
  readonly #symlinkAnalyzer: SymlinkAnalyzer;
  readonly #archiveManager: ArchiveManager | undefined;
  readonly #archiveFilePath: string | undefined;
  readonly #linkCreationMode: LinkCreationMode;
  readonly #includedAssetPaths: Set<string> = new Set<string>();
  #isFinalized: boolean = false;

  public constructor(options: IAssetHandlerOptions) {
    const {
      terminal,
      sourceRootFolder,
      targetRootFolder,
      linkCreation,
      symlinkAnalyzer,
      createArchiveFilePath,
      createArchiveOnly = false
    } = options;
    this.#terminal = terminal;
    this.#sourceRootFolder = sourceRootFolder;
    this.#targetRootFolder = targetRootFolder;
    this.#symlinkAnalyzer = symlinkAnalyzer;
    if (createArchiveFilePath) {
      if (path.extname(createArchiveFilePath) !== '.zip') {
        throw new Error('Only archives with the .zip file extension are currently supported.');
      }
      this.#archiveFilePath = path.resolve(targetRootFolder, createArchiveFilePath);
      this.#archiveManager = new ArchiveManager();
    }
    if (createArchiveOnly && !this.#archiveManager) {
      throw new Error('createArchiveOnly cannot be true if createArchiveFilePath is not provided');
    }
    this.#createArchiveOnly = createArchiveOnly;
    this.#linkCreationMode = linkCreation || 'default';
  }

  public async includeAssetAsync(options: IIncludeAssetPathOptions): Promise<void>;
  public async includeAssetAsync(options: IIncludeExistingAssetPathOptions): Promise<void>;
  public async includeAssetAsync(options: IIncludeAssetContentOptions): Promise<void>;
  public async includeAssetAsync(options: IIncludeAssetOptions): Promise<void> {
    const { sourceFileContent, targetFilePath, ignoreIfExisting = false } = options;
    let { sourceFilePath } = options;

    if (this.#isFinalized) {
      throw new Error('includeAssetAsync() cannot be called after finalizeAsync()');
    }
    if (!sourceFilePath && !sourceFileContent) {
      if (!Path.isUnder(targetFilePath, this.#targetRootFolder)) {
        throw new Error('The existing asset path must be under the target root folder');
      }
      sourceFilePath = targetFilePath;
    }
    if (sourceFilePath && sourceFileContent) {
      throw new Error('Either sourceFilePath or sourceFileContent must be provided, but not both');
    }
    if (this.#includedAssetPaths.has(targetFilePath)) {
      if (ignoreIfExisting) {
        return;
      }
      throw new Error(`The asset at path "${targetFilePath}" has already been included`);
    }

    if (!this.#createArchiveOnly) {
      // Ignore when the source file is the same as the target file, as it's a no-op
      if (sourceFilePath && sourceFilePath !== targetFilePath) {
        // Use the fs.copyFile API instead of FileSystem.copyFileAsync() since copyFileAsync performs
        // a needless stat() call to determine if it's a file or folder, and we already know it's a file.
        try {
          await fs.promises.copyFile(sourceFilePath, targetFilePath, fs.constants.COPYFILE_EXCL);
        } catch (e: unknown) {
          if (!FileSystem.isNotExistError(e as Error)) {
            throw e;
          }
          // The parent folder may not exist, so ensure it exists before trying to copy again
          await FileSystem.ensureFolderAsync(path.dirname(targetFilePath));
          await fs.promises.copyFile(sourceFilePath, targetFilePath, fs.constants.COPYFILE_EXCL);
        }
      } else if (sourceFileContent) {
        await FileSystem.writeFileAsync(targetFilePath, sourceFileContent, {
          ensureFolderExists: true
        });
      }
    }

    if (this.#archiveManager) {
      const targetRelativeFilePath: string = path.relative(this.#targetRootFolder, targetFilePath);
      if (sourceFilePath) {
        await this.#archiveManager.addToArchiveAsync({
          filePath: sourceFilePath,
          archivePath: targetRelativeFilePath
        });
      } else if (sourceFileContent) {
        await this.#archiveManager.addToArchiveAsync({
          fileData: sourceFileContent,
          archivePath: targetRelativeFilePath
        });
      }
    }

    this.#includedAssetPaths.add(targetFilePath);
  }

  public get assetPaths(): string[] {
    return [...this.#includedAssetPaths];
  }

  public async finalizeAsync(options?: IFinalizeOptions): Promise<void> {
    const { onAfterExtractSymlinksAsync } = options ?? {};

    if (this.#isFinalized) {
      throw new Error('finalizeAsync() has already been called');
    }

    if (this.#linkCreationMode === 'default') {
      this.#terminal.writeLine('Creating symlinks');
      const linksToCopy: ILinkInfo[] = this.#symlinkAnalyzer.reportSymlinks();
      await Async.forEachAsync(linksToCopy, async (linkToCopy: ILinkInfo) => {
        await this._extractSymlinkAsync(linkToCopy);
      });
    }

    await onAfterExtractSymlinksAsync?.();

    if (this.#archiveManager && this.#archiveFilePath) {
      this.#terminal.writeLine(`Creating archive at "${this.#archiveFilePath}"`);
      await this.#archiveManager.createArchiveAsync(this.#archiveFilePath);
    }

    this.#isFinalized = true;
  }

  /**
   * Create a symlink as described by the ILinkInfo object.
   */
  private async _extractSymlinkAsync(linkInfo: ILinkInfo): Promise<void> {
    const { kind, linkPath, targetPath } = {
      ...linkInfo,
      linkPath: remapSourcePathForTargetFolder({
        sourceRootFolder: this.#sourceRootFolder,
        targetRootFolder: this.#targetRootFolder,
        sourcePath: linkInfo.linkPath
      }),
      targetPath: remapSourcePathForTargetFolder({
        sourceRootFolder: this.#sourceRootFolder,
        targetRootFolder: this.#targetRootFolder,
        sourcePath: linkInfo.targetPath
      })
    };

    const newLinkFolder: string = path.dirname(linkPath);
    await FileSystem.ensureFolderAsync(newLinkFolder);

    // Link to the relative path for symlinks
    const relativeTargetPath: string = path.relative(newLinkFolder, targetPath);

    // NOTE: This logic is based on NpmLinkManager._createSymlink()
    if (kind === 'fileLink') {
      // For files, we use a Windows "hard link", because creating a symbolic link requires
      // administrator permission. However hard links seem to cause build failures on Mac,
      // so for all other operating systems we use symbolic links for this case.
      if (process.platform === 'win32') {
        await FileSystem.createHardLinkAsync({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkPath
        });
      } else {
        await FileSystem.createSymbolicLinkFileAsync({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkPath
        });
      }
    } else {
      // Junctions are only supported on Windows. This will create a symbolic link on other platforms.
      await FileSystem.createSymbolicLinkJunctionAsync({
        linkTargetPath: relativeTargetPath,
        newLinkPath: linkPath
      });
    }

    // Since the created symlinks have the required relative paths, they can be added directly to
    // the archive.
    await this.includeAssetAsync({ targetFilePath: linkPath });
  }
}
