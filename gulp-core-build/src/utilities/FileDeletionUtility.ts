import * as path from 'path';
import * as globEscape from 'glob-escape';
import globby = require('globby');

/* tslint:disable:typedef */
const del = require('del');
/* tslint:disable:typedef */

export class FileDeletionUtility {
  public static deletePatterns(patterns: string[]) {
    const files: string[] = globby.sync(patterns);
    this.deleteFiles(files);
  }

  public static deleteFiles(files: string[]) {
    del.sync(this.escapeFilepaths(this.removeChildren(files)));
  }

  public static escapeFilepaths(files: string[]): string[] {
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
    let currentParent = undefined;

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

  public static isParentDirectory(directory: string, filepath: string): boolean {
    if (!directory || !filepath) {
      return false;
    }

    const directoryParts: string[] = path.resolve(directory).split(path.sep);
    const fileParts: string[] = path.resolve(filepath).split(path.sep);

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