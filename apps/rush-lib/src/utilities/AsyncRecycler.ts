// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Text, Path, FileSystem } from '@microsoft/node-core-library';

import { Utilities } from './Utilities';

/**
 * For deleting large folders, AsyncRecycler is significantly faster than Utilities.dangerouslyDeletePath().
 * It works by moving one or more folders into a temporary "recycler" folder, and then launches a separate
 * background process to recursively delete that folder.
 */
export class AsyncRecycler {
  private _recyclerFolder: string;
  private _movedFolderCount: number;
  private _deleting: boolean;

  constructor(recyclerFolder: string) {
    this._recyclerFolder = path.resolve(recyclerFolder);
    this._movedFolderCount = 0;
    this._deleting = false;
  }

  /**
   * The full path of the recycler folder.
   * Example: `C:\MyRepo\common\rush-recycler`
   */
  public get recyclerFolder(): string {
    return this._recyclerFolder;
  }

  /**
   * Synchronously moves the specified folder into the recycler folder.  If the specified folder
   * does not exist, then no operation is performed.  After calling this function one or more times,
   * deleteAll() must be called to actually delete the contents of the recycler folder.
   */
  public moveFolder(folderPath: string): void {
    if (this._deleting) {
      throw new Error('AsyncRecycler.moveFolder() must not be called after deleteAll() has started');
    }

    if (Path.isUnder(this.recyclerFolder, folderPath)) {
      throw new Error('AsyncRecycler.moveFolder() cannot be called on a parent of the recycler folder');
    }

    if (!FileSystem.exists(folderPath)) {
      return;
    }

    ++this._movedFolderCount;

    // We need to do a simple "FileSystem.move" here, however if the folder we're trying to rename
    // has a lock, or if its destination container doesn't exist yet,
    // then there seems to be some OS process (virus scanner?) that holds
    // a lock on the folder for a split second, which causes renameSync to
    // fail. To workaround that, retry for up to 7 seconds before giving up.
    const maxWaitTimeMs: number = 7 * 1000;

    const oldFolderName: string = path.basename(folderPath);
    const newFolderPath: string = path.join(this.recyclerFolder, `${oldFolderName}_${new Date().getTime()}`);

    if (!FileSystem.exists(this.recyclerFolder)) {
      Utilities.createFolderWithRetry(this.recyclerFolder);
    }

    Utilities.retryUntilTimeout(
      () => FileSystem.move({ sourcePath: folderPath, destinationPath: newFolderPath }),
      maxWaitTimeMs,
      e =>
        new Error(
          `Error: ${e}${os.EOL}Often this is caused by a file lock ` +
            'from a process like the virus scanner.'
        ),
      'recycleFolder'
    );
  }

  /**
   * This deletes all items under the specified folder, except for the items in the membersToExclude.
   * To be conservative, a case-insensitive comparison is used for membersToExclude.
   * The membersToExclude must be file/folder names that would match readdir() results.
   */
  public moveAllItemsInFolder(folderPath: string, membersToExclude?: ReadonlyArray<string>): void {
    const resolvedFolderPath: string = path.resolve(folderPath);

    const excludeSet: Set<string> = new Set<string>((membersToExclude || []).map(x => x.toUpperCase()));

    for (const memberPath of FileSystem.readFolder(resolvedFolderPath, { absolutePaths: true })) {
      const normalizedMemberName: string = path.basename(memberPath).toUpperCase();
      if (!excludeSet.has(normalizedMemberName)) {
        let shouldMove: boolean = false;
        try {
          const stats: fs.Stats = FileSystem.getLinkStatistics(memberPath);
          shouldMove = stats.isDirectory();
        } catch (error) {
          // If we fail to access the item, assume it's not a folder
        }
        if (shouldMove) {
          this.moveFolder(memberPath);
        } else {
          FileSystem.deleteFolder(memberPath);
        }
      }
    }
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
    let command: string;
    let args: string[];

    const options: child_process.SpawnOptions = {
      detached: true,
      // The child won't stay alive unless we detach its stdio
      stdio: 'ignore'
    };

    if (os.platform() === 'win32') {
      // PowerShell.exe doesn't work with a detached console, so we need cmd.exe to create
      // the new console for us.
      command = 'cmd.exe';

      // In PowerShell single-quote literals, single quotes are escaped by doubling them
      const escapedRecyclerFolder: string = Text.replaceAll(this.recyclerFolder, "'", "''");

      // As of PowerShell 3.0, the "\\?" prefix can be used for paths that exceed MAX_PATH.
      // (This prefix does not seem to work for cmd.exe's "rd" command.)
      args = [
        '/c',
        '"' +
          'PowerShell.exe -Version 3.0 -NoLogo -NonInteractive -WindowStyle Hidden -Command' +
          ` Get-ChildItem -Force '${escapedRecyclerFolder}'` +
          // The "^|" here prevents cmd.exe from interpreting the "|" symbol
          ` ^| ForEach ($_) { Remove-Item -ErrorAction Ignore -Force -Recurse "\\\\?\\$($_.FullName)" }` +
          '"'
      ];

      options.windowsVerbatimArguments = true;
    } else {
      command = 'rm';
      args = ['-rf'];

      let pathCount: number = 0;

      // child_process.spawn() doesn't expand wildcards.  To be safe, we will do it manually
      // rather than rely on an unknown shell.
      for (const filename of FileSystem.readFolder(this.recyclerFolder)) {
        // The "." and ".." are supposed to be excluded, but let's be safe
        if (filename !== '.' && filename !== '..') {
          args.push(path.join(this.recyclerFolder, filename));
          ++pathCount;
        }
      }

      if (pathCount === 0) {
        // Nothing to do
        return;
      }
    }

    const process: child_process.ChildProcess = child_process.spawn(command, args, options);

    // The child won't stay alive unless we unlink it from the parent process
    process.unref();
  }
}
