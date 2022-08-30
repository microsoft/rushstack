// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as chokidar from 'chokidar';
import * as path from 'path';

interface IPromiseResolverPair {
  promise: Promise<void>;
  resolveFn: () => void;
}

type FileEventType = 'add' | 'change' | 'unlink';

/**
 * Used to track the state of a file using a provided file watcher. Since there is an upper limit to
 * the number of watcher listeners that can be registered, use this class to track the state of a
 * file and provide a promise to be resolved when the respective event is received.
 */
export class FileEventListener {
  // File path -> Event name -> Promise resolver pair
  private readonly _watchedFileEventPromisesByPath: Map<string, Map<FileEventType, IPromiseResolverPair>> =
    new Map();
  private readonly _watchPath: string | undefined;

  public constructor(watcher: chokidar.FSWatcher) {
    this._watchPath = watcher.options.cwd;
    // Limit watcher usage by listening to all events and filtering out the ones we don't care about
    watcher.on('all', this._handleEvent.bind(this));
  }

  /**
   * Wait for the file to be created at the specified path.
   */
  public async waitForCreateAsync(filePath: string): Promise<void> {
    await this._waitForFileEventAsync('add', filePath);
  }

  /**
   * Wait for the file to change at the specified path.
   */
  public async waitForChangeAsync(filePath: string): Promise<void> {
    await this._waitForFileEventAsync('change', filePath);
  }

  /**
   * Wait for the file to be deleted at the specified path.
   */
  public async waitForDeleteAsync(filePath: string): Promise<void> {
    await this._waitForFileEventAsync('unlink', filePath);
  }

  private async _waitForFileEventAsync(eventName: FileEventType, filePath: string): Promise<void> {
    // Check to see if we're already waiting for this file
    let promisesByEventName: Map<FileEventType, IPromiseResolverPair> | undefined =
      this._watchedFileEventPromisesByPath.get(filePath);
    if (!promisesByEventName) {
      promisesByEventName = new Map();
      this._watchedFileEventPromisesByPath.set(filePath, promisesByEventName);
    }

    // Check to see if we're already waiting for this event, and create a new promise if not
    let { promise } = promisesByEventName.get(eventName) || {};
    if (!promise) {
      let resolveFn: (() => void) | undefined;
      promise = new Promise<void>((resolve) => {
        resolveFn = resolve;
      });
      promisesByEventName.set(eventName, { promise, resolveFn: resolveFn! });
    }

    return promise;
  }

  private _handleEvent(eventName: string, relativePath: string): void {
    // Path will be relative only when the watch path is specified, otherwise it should be an absolute path
    const filePath: string = this._watchPath ? path.join(this._watchPath, relativePath) : relativePath;
    const promisesByEventName: Map<string, IPromiseResolverPair> | undefined =
      this._watchedFileEventPromisesByPath.get(filePath);
    if (!promisesByEventName) {
      return;
    }

    // Check to see if we were waiting for this event
    const { resolveFn } = promisesByEventName.get(eventName) || {};
    if (!resolveFn) {
      return;
    }

    // Clean up references to the waiter and resolve the function
    promisesByEventName.delete(eventName);
    resolveFn();
  }
}
