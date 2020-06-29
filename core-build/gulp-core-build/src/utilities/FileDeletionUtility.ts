// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import globEscape = require('glob-escape');
import globby = require('globby');

// eslint-disable-next-line
const del = require('del');

export class FileDeletionUtility {
  public static deletePatterns(patterns: string[]): void {
    const files: string[] = globby.sync(patterns);
    this.deleteFiles(files);
  }

  public static deleteFiles(files: string[]): void {
    del.sync(this.escapeFilePaths(this.removeChildren(files)));
  }

  public static escapeFilePaths(files: string[]): string[] {
    return files.map((file: string) => {
      return globEscape(file);
    });
  }

  public static removeChildren(filenames: string[]): string[] {
    // Appears to be a known issue with `del` whereby
    // if you ask to delete both a folder, and something in the folder,
    // it randomly chooses which one to delete first, which can cause
    // the function to fail sporadically. The fix for this is simple:
    // we need to remove any cleanPaths which exist under a folder we
    // are attempting to delete

    // First we sort the list of files. We know that if something is a file,
    // if matched, the parent folder should appear earlier in the list
    filenames.sort();

    // We need to determine which paths exist under other paths, and remove them from the
    // list of files to delete
    const filesToDelete: string[] = [];

    // current working directory
    let currentParent: string | undefined = undefined;

    for (let i: number = 0; i < filenames.length; i++) {
      const curFile: string = filenames[i];
      if (this.isParentDirectory(currentParent, curFile)) {
        continue;
      } else {
        filesToDelete.push(curFile);
        currentParent = curFile;
      }
    }
    return filesToDelete;
  }

  public static isParentDirectory(directory: string | undefined, filePath: string | undefined): boolean {
    if (!directory || !filePath) {
      return false;
    }

    const directoryParts: string[] = path.resolve(directory).split(path.sep);
    const fileParts: string[] = path.resolve(filePath).split(path.sep);

    if (directoryParts[directoryParts.length - 1] === '') {
      // this is to fix an issue with windows roots
      directoryParts.pop();
    }

    if (directoryParts.length >= fileParts.length) {
      return false;
    }

    for (let i: number = 0; i < directoryParts.length; i++) {
      if (directoryParts[i] !== fileParts[i]) {
        return false;
      }
    }
    return true;
  }
}
