// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fsx from 'fs-extra';

import RushConfiguration from '../data/RushConfiguration';
import Utilities from './Utilities';

/**
 * For deleting large folders, AsyncRecycler is significantly faster than Utilities.dangerouslyDeletePath().
 * It works by moving one or more folders into a temporary "recycler" folder, and then launches a separate
 * background process to recursively delete that folder.
 * @public
 */
export default class AsyncRecycler {
  private _rushConfiguration: RushConfiguration;
  private _recyclerFolder: string;
  private _movedFolderCount: number;
  private _deleting: boolean;

  constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._recyclerFolder = path.join(rushConfiguration.commonFolder, 'rush-recycler');
    this._movedFolderCount = 0;
    this._deleting = false;
  }

  /**
   * The full path of the recycler folder.
   * Example: "C:\MyRepo\common\rush-recycler"
   */
  public get recyclerFolder(): string {
    return this._recyclerFolder;
  }

  /**
   * Synchronously moves the specified folder into the recycler folder.
   * After calling this function one or more times, deleteAll() must be called to delete
   * the contents of the recycler folder.
   */
  public moveFolder(folderPath: string): void {
    if (this._deleting) {
      throw new Error('AsyncRecycler.moveFolder() must not be called after deleteAll() has started');
    }
    ++this._movedFolderCount;

    // We need to do a simple "fs.renameSync" here, however if the folder we're trying to rename
    // has a lock, or if its destination container doesn't exist yet,
    // then there seems to be some OS process (virus scanner?) that holds
    // a lock on the folder for a split second, which causes renameSync to
    // fail. To workaround that, retry for up to 7 seconds before giving up.
    const maxWaitTimeMs: number = 7 * 1000;

    const oldFolderName: string = path.basename(folderPath);
    const newFolderPath: string = path.join(this.recyclerFolder, `${oldFolderName}_${new Date().getTime()}`);

    if (!fsx.existsSync(this.recyclerFolder)) {
      Utilities.createFolderWithRetry(this.recyclerFolder);
    }

    Utilities.retryUntilTimeout(
      () => fsx.renameSync(folderPath, newFolderPath),
      maxWaitTimeMs,
      (e) => new Error(`Error: ${e}${os.EOL}Often this is caused by a file lock ` +
                      'from a process like the virus scanner.'),
      'recycleFolder'
    );
  }

  /**
   * Starts an asynchronous process to delete the recycler folder.  Deleting will continue
   * even if the current NodeJS process is killed.
   *
   * NOTE: To avoid spawning multiple instances of the same command, moveFolder()
   * MUST NOT be called again after deleteAll() has started.
   */
  public deleteAll(): void {
    if (this._deleting) {
      throw new Error('AsyncRecycler.deleteAll() must not be called more than once');
    }

    this._deleting = true;

    if (this._movedFolderCount === 0) {
      // Nothing to do
      return;
    }

    // Asynchronously delete the folder contents.
    const recyclerFolderContents: string = path.join(this.recyclerFolder, '*');

    const windowsTrimmedRecyclerFolder: string = this.recyclerFolder.match(/\\$/)
      ? this.recyclerFolder.substring(0, this.recyclerFolder.length - 1)
      : this.recyclerFolder;
    const command: string = os.platform() === 'win32'
      // Windows
      ? 'cmd.exe'
      // Assume 'NIX or Darwin
      : 'rm';

    const args: string[] = os.platform() === 'win32'
      // Windows
      ? [
        '/c',
        `FOR /F %f IN ('dir /B \\\\?\\${recyclerFolderContents}') `
          + `DO rd /S /Q \\\\?\\${windowsTrimmedRecyclerFolder}\\%f`
      ]
      // Assume 'NIX or Darwin
      : ['-rf', `"${recyclerFolderContents}"`];

    const options: child_process.SpawnOptions = {
      detached: true,
      stdio: [ 'ignore', 'ignore', 'ignore' ]
    };

    const process: child_process.ChildProcess = child_process.spawn(command, args, options);
    process.unref();
  }

}
