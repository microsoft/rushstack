// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import type { IPackageJson } from '@rushstack/node-core-library';

import type { IRequestMessage, ResponseMessage } from './pnpmfileRunnerWorkerThread';

interface IPromise {
  resolve: (r: IPackageJson) => void;
  reject: (e: Error) => void;
}

/**
 * Evals `.pnpmfile.cjs` in an isolated thread, so `transformPackageAsync()` can be used to rewrite
 * package.json files.  Calling `disposeAsync()` will free the loaded modules.
 */
export class PnpmfileRunner {
  private _worker: Worker;
  private _nextId: number = 1000;
  private _promisesById: Map<number, IPromise> = new Map();
  private _disposed: boolean = false;

  public logger: ((message: string) => void) | undefined = undefined;

  public constructor(pnpmfilePath: string) {
    this._worker = new Worker(path.join(`${__dirname}/pnpmfileRunnerWorkerThread.js`), {
      workerData: { pnpmfilePath }
    });

    this._worker.on('message', (message: ResponseMessage) => {
      const id: number = message.id;
      const promise: IPromise | undefined = this._promisesById.get(id);
      if (!promise) {
        return;
      }

      if (message.kind === 'return') {
        this._promisesById.delete(id);
        // TODO: Validate the user's readPackage() return value
        const result: IPackageJson = message.result as IPackageJson;
        promise.resolve(result);
      } else if (message.kind === 'log') {
        // No this._promisesById.delete(id) for this case
        if (this.logger) {
          this.logger(message.log);
        } else {
          console.log('.pnpmfile.cjs: ' + message.log);
        }
      } else {
        this._promisesById.delete(id);
        promise.reject(new Error(message.error || 'An unknown error occurred'));
      }
    });

    this._worker.on('error', (err) => {
      for (const promise of this._promisesById.values()) {
        promise.reject(err);
      }
      this._promisesById.clear();
    });

    this._worker.on('exit', (code) => {
      if (!this._disposed) {
        const error: Error = new Error(
          `PnpmfileRunner worker thread terminated unexpectedly with exit code ${code}`
        );
        console.error(error);
        for (const promise of this._promisesById.values()) {
          promise.reject(error);
        }
        this._promisesById.clear();
      }
    });
  }

  /**
   * Invokes the readPackage() hook from .pnpmfile.cjs
   */
  public transformPackageAsync(
    packageJson: IPackageJson,
    packageJsonFullPath: string
  ): Promise<IPackageJson> {
    if (this._disposed) {
      return Promise.reject(new Error('The operation failed because PnpmfileRunner has been disposed'));
    }

    const id: number = this._nextId++;
    return new Promise((resolve, reject) => {
      this._promisesById.set(id, { resolve, reject });
      this._worker.postMessage({ id, packageJson, packageJsonFullPath } satisfies IRequestMessage);
    });
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this._disposed) {
      return;
    }
    for (const pending of this._promisesById.values()) {
      pending.reject(new Error('Aborted because PnpmfileRunner was disposed'));
    }
    this._promisesById.clear();
    this._disposed = true;
    await this._worker.terminate();
  }
}
