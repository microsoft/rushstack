// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';

const PROCESS_STATUS_PATH: string = '/proc/self/status';
const RESIDENT_SET_SIZE_PATTERN: RegExp = /^VmRSS:\s*(\d+)\s+kB$/m;
const BYTES_PER_KIBIBYTE: number = 1024;

function tryReadProcessStatusResidentMemoryBytes(): number | undefined {
  let status: string;
  try {
    status = FileSystem.readFile(PROCESS_STATUS_PATH);
  } catch {
    return undefined;
  }
  const kibibytes: string | undefined = RESIDENT_SET_SIZE_PATTERN.exec(status)?.[1];
  if (kibibytes === undefined) {
    return undefined;
  }
  const bytes: number = Number(kibibytes) * BYTES_PER_KIBIBYTE;
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : undefined;
}

/**
 * Returns the resident set size of this process, in bytes.
 *
 * @remarks
 * On Linux, this is `VmRSS` from `/proc/self/status`, which recent kernels compute from exact counters.
 * `process.memoryUsage().rss` reads `/proc/self/stat` instead, whose count leaves out what each CPU has not yet added
 * to the total, so on a machine with many CPUs it can be off by hundreds of megabytes, in either direction.
 * On other platforms, or if the file can't be read or parsed, this returns `process.memoryUsage.rss()`.
 */
export function readResidentMemoryBytes(): number {
  return (
    (process.platform === 'linux' ? tryReadProcessStatusResidentMemoryBytes() : undefined) ??
    process.memoryUsage.rss()
  );
}
