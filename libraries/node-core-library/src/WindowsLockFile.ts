// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

export interface ILockFileHandle {
  prepareForRelease?(deleteFile: boolean): void;
  close(): void;
}

export interface IWindowsLockFileResult {
  readonly fileWriter: ILockFileHandle;
  readonly filePath: string;
  readonly dirtyWhenAcquired: boolean;
}

// Public libuv Windows flag (supported since libuv 1.17), not exposed in fs.constants.
// https://docs.libuv.org/en/v1.x/fs.html#c.UV_FS_O_EXLOCK
const UV_FS_O_EXLOCK: number = 0x10000000;
const CLEAN_MARKER: Buffer = Buffer.from('rushstack-lockfile-clean-v1\n');

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/** Uses Windows sharing exclusion; O_EXCL alone only guarantees exclusive creation. */
export function tryAcquireWindowsLockFile(filePath: string): IWindowsLockFileResult | undefined {
  if (process.platform !== 'win32' || !process.versions.uv.startsWith('1.')) {
    throw new Error('Native Windows file locking requires the supported libuv 1.x flag ABI.');
  }
  const flags: number = fs.constants.O_RDWR + UV_FS_O_EXLOCK;
  let descriptor: number | undefined;
  let created: boolean = false;
  try {
    descriptor = fs.openSync(filePath, flags + fs.constants.O_CREAT + fs.constants.O_EXCL);
    created = true;
  } catch (error) {
    if (hasCode(error, 'EBUSY')) return undefined;
    if (!hasCode(error, 'EEXIST')) throw error;
    try {
      descriptor = fs.openSync(filePath, flags);
    } catch (openError) {
      if (hasCode(openError, 'EBUSY') || hasCode(openError, 'ENOENT')) return undefined;
      throw openError;
    }
  }

  try {
    assertExclusiveSharing(filePath);
    const stats: fs.BigIntStats = fs.fstatSync(descriptor, { bigint: true });
    const pathStats: fs.BigIntStats = fs.lstatSync(filePath, { bigint: true });
    if (
      !stats.isFile() || !pathStats.isFile() || stats.nlink !== 1n ||
      stats.dev !== pathStats.dev || stats.ino !== pathStats.ino
    ) {
      throw new Error(`The lock path must identify one unshared regular file: ${filePath}`);
    }

    // A previous release may delete the main pathname after a subsequent owner has already exited.
    // This companion survives that close/delete race and is cleared only under exclusive ownership.
    const dirtyPath: string = `${filePath}.dirty`;
    const dirtyMarkerExists: boolean = fs.lstatSync(dirtyPath, { throwIfNoEntry: false }) !== undefined;
    const dirtyWhenAcquired: boolean =
      dirtyMarkerExists || (!created && !hasCleanMarker(descriptor, stats.size));
    try {
      fs.writeFileSync(dirtyPath, '', { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error;
    }

    let heldDescriptor: number | undefined = descriptor;
    const fileWriter: ILockFileHandle = {
      prepareForRelease: (deleteFile) => {
        if (!deleteFile) return;
        if (heldDescriptor === undefined) throw new Error(`The lock is already closed: ${filePath}`);
        fs.ftruncateSync(heldDescriptor, 0);
        if (fs.writeSync(heldDescriptor, CLEAN_MARKER, 0, CLEAN_MARKER.length, 0) !== CLEAN_MARKER.length) {
          throw new Error(`Could not record the clean lock release: ${filePath}`);
        }
        try {
          fs.unlinkSync(dirtyPath);
        } catch (error) {
          if (!hasCode(error, 'ENOENT')) throw error;
        }
      },
      close: () => {
        if (heldDescriptor !== undefined) {
          fs.closeSync(heldDescriptor);
          heldDescriptor = undefined;
        }
      }
    };
    descriptor = undefined;
    return { fileWriter, filePath, dirtyWhenAcquired };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function assertExclusiveSharing(filePath: string): void {
  let sharedDescriptor: number | undefined;
  try {
    sharedDescriptor = fs.openSync(filePath, fs.constants.O_RDONLY);
  } catch (error) {
    if (hasCode(error, 'EBUSY')) return;
    throw error;
  } finally {
    if (sharedDescriptor !== undefined) fs.closeSync(sharedDescriptor);
  }
  throw new Error(`The runtime did not enforce native exclusive file sharing: ${filePath}`);
}

function hasCleanMarker(descriptor: number, size: bigint): boolean {
  if (size !== BigInt(CLEAN_MARKER.length)) return false;
  const contents: Buffer = Buffer.alloc(CLEAN_MARKER.length);
  return (
    fs.readSync(descriptor, contents, 0, contents.length, 0) === contents.length &&
    contents.equals(CLEAN_MARKER)
  );
}
