// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, IFileSystemCreateLinkOptions } from '@rushstack/node-core-library';

export type FilesystemType = Omit<typeof FileSystem, 'prototype'>;

export interface IReadFolderFilesAndDirectoriesResult {
  files: string[];
  directories: string[];
}

export interface ICreateHardLinkExtendedOptions extends IFileSystemCreateLinkOptions {
  preserveExisting: boolean;
}

export interface IExtendedFileSystem extends FilesystemType {
  readFolderFilesAndDirectories(folderPath: string): IReadFolderFilesAndDirectoriesResult;

  createHardLinkExtendedAsync(options: ICreateHardLinkExtendedOptions): Promise<boolean>;
}
