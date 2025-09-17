// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { default as fs, type OpenMode } from 'node:fs';

interface IInternalDisposableFileHandle extends Disposable {
  fd: number;
}

export interface IDisposableFileHandle extends IInternalDisposableFileHandle {
  readonly fd: number;
}

export const DISPOSE_SYMBOL: typeof Symbol.dispose = Symbol.dispose ?? Symbol.for('Symbol.dispose');

export function getDisposableFileHandle(path: string, openMode: OpenMode): IDisposableFileHandle {
  const result: IInternalDisposableFileHandle = {
    fd: fs.openSync(path, openMode),
    [DISPOSE_SYMBOL]: () => {
      if (!isNaN(result.fd)) {
        fs.closeSync(result.fd);
        result.fd = NaN;
      }
    }
  };

  return result;
}

export function rmdirSync(dirPath: string): void {
  try {
    fs.rmdirSync(dirPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || (e as NodeJS.ErrnoException).code === 'ENOTDIR') {
      // Not found, ignore
    } else {
      throw e;
    }
  }
}

export function unlinkSync(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (e) {
    if (e && (e as NodeJS.ErrnoException).code === 'ENOENT') {
      // Not found, ignore
    } else {
      throw e;
    }
  }
}
