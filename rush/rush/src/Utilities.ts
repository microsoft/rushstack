/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as del from 'del';

export default class Utilities {
  /**
   * For a scoped NPM package name this separates the scope and name parts.  For example:
   * parseScopedPackgeName('@my-scope/myproject') = { scope: '@my-scope', name: 'myproject' }
   * parseScopedPackgeName('myproject') = { scope: '', name: 'myproject' }
   */
  public static parseScopedPackgeName(scopedName: string): { scope: string, name: string } {
    if (scopedName.substr(0, 1) !== '@') {
      return { scope: '', name: scopedName };
    }

    const slashIndex: number = scopedName.indexOf('/');
    if (slashIndex >= 0) {
      return { scope: scopedName.substr(0, slashIndex), name: scopedName.substr(slashIndex + 1) };
    } else {
      throw new Error('Invalid scoped name: ' + scopedName);
    }
  }

  /**
   * NodeJS equivalent of performance.now().
   */
  public static getTimeInMs(): number {
    let seconds: number;
    let nanoseconds: number;
    [seconds, nanoseconds] = process.hrtime();
    return seconds * 1000 + nanoseconds / 1000000;
  }

  public static createFolderWithRetry(folderName: string): void {
    // We need to do a simple "fs.mkdirSync(localModulesFolder)" here,
    // however if the folder we deleted above happened to contain any files,
    // then there seems to be some OS process (virus scanner?) that holds
    // a lock on the folder for a split second, which causes mkdirSync to
    // fail.  To workaround that, retry for up to 7 seconds before giving up.
    const startTime: number = Utilities.getTimeInMs();
    let looped: boolean = false;
    while (true) {
      try {
        fs.mkdirSync(folderName);
        break;
      } catch (e) {
        looped = true;
        const currentTime: number = Utilities.getTimeInMs();
        if (currentTime - startTime > 7000) {
          throw new Error(e.message + os.EOL + 'Often this is caused by a file lock'
            + ' from a process such as your text editor, command prompt, or "gulp serve"');
        }
      }
    }
    if (looped) {
      const currentTime: number = Utilities.getTimeInMs();
      console.log('createFolderWithRetry() stalled for '
        + (currentTime - startTime).toString() + ' ms');
    }
  }

  /**
   * BE VERY CAREFUL CALLING THIS FUNCTION!
   */
  public static dangerouslyDeletePath(folderPath: string): void {
    try {
      del.sync(folderPath, { force: true });
    } catch (e) {
      throw new Error(e.message + os.EOL + 'Often this is caused by a file lock'
        + ' from a process such as your text editor, command prompt, or "gulp serve"');
    }
  }

  /**
   * Any top-level try catch blocks should report their error through this
   * function.  When debugging, we can show the full call stack.
   */
  public static reportError(error: Error) {
    console.error(os.EOL + 'ERROR: ' + error.message);
  }
}

