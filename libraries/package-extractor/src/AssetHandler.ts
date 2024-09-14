// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import fs from 'node:fs';
import { FileSystem, Path, type FileSystemStats } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { ArchiveManager } from './ArchiveManager';
import type { IExtractorOptions, LinkCreationMode } from './PackageExtractor';

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

export class AssetHandler {
  private readonly _terminal: ITerminal;
  private readonly _targetRootFolder: string;
  private readonly _createArchiveOnly: boolean;
  private readonly _archiveManager: ArchiveManager | undefined;
  private readonly _archiveFilePath: string | undefined;
  private readonly _linkCreationMode: LinkCreationMode;
  private readonly _includedAssetPaths: Set<string> = new Set<string>();
  private _isFinalized: boolean = false;

  public constructor(options: IExtractorOptions) {
    const {
      terminal,
      targetRootFolder,
      linkCreation,
      createArchiveFilePath,
      createArchiveOnly = false
    } = options;
    this._terminal = terminal;
    this._targetRootFolder = targetRootFolder;
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

  public async finalizeAsync(): Promise<void> {
    if (this._isFinalized) {
      throw new Error('finalizeAsync() has already been called');
    }
    if (this._archiveManager && this._archiveFilePath) {
      this._terminal.writeLine(`Creating archive at "${this._archiveFilePath}"`);
      await this._archiveManager.createArchiveAsync(this._archiveFilePath);
    }
    this._isFinalized = true;
  }
}
