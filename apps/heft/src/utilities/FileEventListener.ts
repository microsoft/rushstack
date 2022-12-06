// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as chokidar from 'chokidar';
import * as path from 'path';

interface IPromiseResolverPair {
  promise: Promise<void>;
  resolveFn: () => void;
}

/**
 * Used to track the state of a file using a provided file watcher. Since there is an upper limit to
 * the number of watcher listeners that can be registered, use this class to track the state of a
 * file and provide a promise to be resolved when the respective event is received.
 */
export class FileEventListener {
  // File path -> Promise resolver pair
  private readonly _watchedFileEventPromisesByPath: Map<string, IPromiseResolverPair> = new Map();
  private readonly _watchPath: string | undefined;

  public constructor(watcher: chokidar.FSWatcher) {
    this._watchPath = watcher.options.cwd;
    // Limit watcher usage by listening to all events and filtering out the ones we don't care about
    watcher.on('all', this._handleEvent.bind(this));
  }

  /**
   * Wait for any file event at the specified path.
   */
  public async waitForEventAsync(filePath: string): Promise<void> {
    if (!path.isAbsolute(filePath)) {
      throw new Error(`Provided path must be absolute: "${filePath}"`);
    }

    if (this._watchPath) {
      filePath = path.relative(this._watchPath, filePath);
    }

    // Check to see if we're already waiting for this event, and create a new promise if not
    let { promise } = this._watchedFileEventPromisesByPath.get(filePath) || {};
    if (!promise) {
      let resolveFn: (() => void) | undefined;
      promise = new Promise<void>((resolve) => {
        resolveFn = resolve;
      });
      this._watchedFileEventPromisesByPath.set(filePath, { promise, resolveFn: resolveFn! });
    }

    return promise;
  }

  private _handleEvent(eventName: string, filePath: string): void {
    const promiseResolverPair: IPromiseResolverPair | undefined =
      this._watchedFileEventPromisesByPath.get(filePath);
    if (promiseResolverPair) {
      // Clean up references to the waiter and resolve the function
      this._watchedFileEventPromisesByPath.delete(filePath);
      promiseResolverPair.resolveFn();
    }
  }
}
