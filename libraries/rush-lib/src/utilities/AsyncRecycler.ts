// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Text, Path, FileSystem, type FolderItem } from '@rushstack/node-core-library';

import { Utilities } from './Utilities';

/**
 * For deleting large folders, AsyncRecycler is significantly faster than Utilities.dangerouslyDeletePath().
 * It works by moving one or more folders into a temporary "recycler" folder, and then launches a separate
 * background process to recursively delete that folder.
 */
export class AsyncRecycler {
  private _movedFolderCount: number;
  private _deleting: boolean;
  private _prefix: string;

  /**
   * The full path of the recycler folder.
   * Example: `C:\MyRepo\common\rush-recycler`
   */
  public readonly recyclerFolder: string;

  public constructor(recyclerFolder: string) {
    this.recyclerFolder = path.resolve(recyclerFolder);
    this._movedFolderCount = 0;
    this._deleting = false;
    this._prefix = `${Date.now()}`;
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

    // We need to do a simple "fs.renameSync" here, however if the folder we're trying to rename
    // has a lock, or if its destination container doesn't exist yet,
    // then there seems to be some OS process (virus scanner?) that holds
    // a lock on the folder for a split second, which causes renameSync to
    // fail. To workaround that, retry for up to 7 seconds before giving up.
    const maxWaitTimeMs: number = 7 * 1000;

    Utilities.createFolderWithRetry(this.recyclerFolder);

    Utilities.retryUntilTimeout(
      () => this._renameOrRecurseInFolder(folderPath),
      maxWaitTimeMs,
      (e) =>
        new Error(`Error: ${e}\nOften this is caused by a file lock from a process like the virus scanner.`),
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

    const excludeSet: Set<string> = new Set<string>((membersToExclude || []).map((x) => x.toUpperCase()));

    for (const dirent of FileSystem.readFolderItems(resolvedFolderPath)) {
      const normalizedMemberName: string = dirent.name.toUpperCase();
      if (!excludeSet.has(normalizedMemberName)) {
        const absolutePath: string = path.resolve(folderPath, dirent.name);
        if (dirent.isDirectory()) {
          this._renameOrRecurseInFolder(absolutePath);
        } else {
          FileSystem.deleteFile(absolutePath);
        }
      }
    }
  }

  /**
   * Starts an asynchronous process to delete the recycler folder.  Deleting will continue
   * even if the current Node.js process is killed.
   *
   * NOTE: To avoid spawning multiple instances of the same command, moveFolder()
   * MUST NOT be called again after deleteAll() has started.
   */
  public async startDeleteAllAsync(): Promise<void> {
    if (this._deleting) {
      throw new Error(
        `${AsyncRecycler.name}.${this.startDeleteAllAsync.name}() must not be called more than once`
      );
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
          'PowerShell.exe -Version 3.0 -NoLogo -NonInteractive -NoProfile -WindowStyle Hidden -Command' +
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

      let folderItemNames: string[] = [];
      try {
        folderItemNames = await FileSystem.readFolderItemNamesAsync(this.recyclerFolder);
      } catch (e) {
        if (!FileSystem.isNotExistError(e)) {
          throw e;
        }
      }

      // child_process.spawn() doesn't expand wildcards.  To be safe, we will do it manually
      // rather than rely on an unknown shell.
      for (const filename of folderItemNames) {
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

  private _renameOrRecurseInFolder(folderPath: string): void {
    const ordinal: number = this._movedFolderCount++;
    const targetDir: string = `${this.recyclerFolder}/${this._prefix}_${ordinal}`;
    try {
      fs.renameSync(folderPath, targetDir);
      return;
    } catch (err) {
      if (FileSystem.isNotExistError(err)) {
        return;
      }

      if (err.code !== 'EPERM') {
        throw err;
      }
    }

    const children: FolderItem[] = FileSystem.readFolderItems(folderPath);
    for (const child of children) {
      const absoluteChild: string = `${folderPath}/${child.name}`;
      if (child.isDirectory()) {
        this._renameOrRecurseInFolder(absoluteChild);
      } else {
        FileSystem.deleteFile(absoluteChild);
      }
    }

    // Yes, this is a folder. The API deletes empty folders, too.
    FileSystem.deleteFile(folderPath);
  }
}
