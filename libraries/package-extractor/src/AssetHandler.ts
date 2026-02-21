// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import fs from 'node:fs';

import { Async, FileSystem, Path, type FileSystemStats } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { ArchiveManager } from './ArchiveManager.ts';
import type { IExtractorOptions, LinkCreationMode } from './PackageExtractor.ts';
import type { ILinkInfo, SymlinkAnalyzer } from './SymlinkAnalyzer.ts';
import { remapSourcePathForTargetFolder } from './Utils.ts';

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
  private readonly _terminal: ITerminal;
  private readonly _sourceRootFolder: string;
  private readonly _targetRootFolder: string;
  private readonly _createArchiveOnly: boolean;
  private readonly _symlinkAnalyzer: SymlinkAnalyzer;
  private readonly _archiveManager: ArchiveManager | undefined;
  private readonly _archiveFilePath: string | undefined;
  private readonly _linkCreationMode: LinkCreationMode;
  private readonly _includedAssetPaths: Set<string> = new Set<string>();
  private _isFinalized: boolean = false;

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
    this._terminal = terminal;
    this._sourceRootFolder = sourceRootFolder;
    this._targetRootFolder = targetRootFolder;
    this._symlinkAnalyzer = symlinkAnalyzer;
    if (createArchiveFilePath) {
      if (path.extname(createArchiveFilePath) !== '.zip') {
        throw new Error('Only archives with the .zip file extension are currently supported.');
      }
      this._archiveFilePath = path.resolve(targetRootFolder, createArchiveFilePath);
      this._archiveManager = new ArchiveManager();
    }
    if (createArchiveOnly && !this._archiveManager) {
      throw new Error('createArchiveOnly cannot be true if createArchiveFilePath is not provided');
    }
    this._createArchiveOnly = createArchiveOnly;
    this._linkCreationMode = linkCreation || 'default';
  }

  public async includeAssetAsync(options: IIncludeAssetPathOptions): Promise<void>;
  public async includeAssetAsync(options: IIncludeExistingAssetPathOptions): Promise<void>;
  public async includeAssetAsync(options: IIncludeAssetContentOptions): Promise<void>;
  public async includeAssetAsync(options: IIncludeAssetOptions): Promise<void> {
    const { sourceFileContent, targetFilePath, ignoreIfExisting = false } = options;
    let { sourceFilePath } = options;

    if (this._isFinalized) {
      throw new Error('includeAssetAsync() cannot be called after finalizeAsync()');
    }
    if (!sourceFilePath && !sourceFileContent) {
      if (!Path.isUnder(targetFilePath, this._targetRootFolder)) {
        throw new Error('The existing asset path must be under the target root folder');
      }
      sourceFilePath = targetFilePath;
    }
    if (sourceFilePath && sourceFileContent) {
      throw new Error('Either sourceFilePath or sourceFileContent must be provided, but not both');
    }
    if (this._includedAssetPaths.has(targetFilePath)) {
      if (ignoreIfExisting) {
        return;
      }
      throw new Error(`The asset at path "${targetFilePath}" has already been included`);
    }

    if (!this._createArchiveOnly) {
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

    if (this._archiveManager) {
      const targetRelativeFilePath: string = path.relative(this._targetRootFolder, targetFilePath);
      if (sourceFilePath) {
        await this._archiveManager.addToArchiveAsync({
          filePath: sourceFilePath,
          archivePath: targetRelativeFilePath
        });
      } else if (sourceFileContent) {
        await this._archiveManager.addToArchiveAsync({
          fileData: sourceFileContent,
          archivePath: targetRelativeFilePath
        });
      }
    }

    this._includedAssetPaths.add(targetFilePath);
  }

  public get assetPaths(): string[] {
    return [...this._includedAssetPaths];
  }

  public async finalizeAsync(options?: IFinalizeOptions): Promise<void> {
    const { onAfterExtractSymlinksAsync } = options ?? {};

    if (this._isFinalized) {
      throw new Error('finalizeAsync() has already been called');
    }

    if (this._linkCreationMode === 'default') {
      this._terminal.writeLine('Creating symlinks');
      const linksToCopy: ILinkInfo[] = this._symlinkAnalyzer.reportSymlinks();
      await Async.forEachAsync(linksToCopy, async (linkToCopy: ILinkInfo) => {
        await this._extractSymlinkAsync(linkToCopy);
      });
    }

    await onAfterExtractSymlinksAsync?.();

    if (this._archiveManager && this._archiveFilePath) {
      this._terminal.writeLine(`Creating archive at "${this._archiveFilePath}"`);
      await this._archiveManager.createArchiveAsync(this._archiveFilePath);
    }

    this._isFinalized = true;
  }

  /**
   * Create a symlink as described by the ILinkInfo object.
   */
  private async _extractSymlinkAsync(linkInfo: ILinkInfo): Promise<void> {
    const { kind, linkPath, targetPath } = {
      ...linkInfo,
      linkPath: remapSourcePathForTargetFolder({
        sourceRootFolder: this._sourceRootFolder,
        targetRootFolder: this._targetRootFolder,
        sourcePath: linkInfo.linkPath
      }),
      targetPath: remapSourcePathForTargetFolder({
        sourceRootFolder: this._sourceRootFolder,
        targetRootFolder: this._targetRootFolder,
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
