// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

const PROC_SELF_STATUS: string = '/proc/self/status';
// For example "VmRSS:\t  123456 kB"; the kernel always gives this line in kibibytes.
const VM_RSS_LINE_PATTERN: RegExp = /^VmRSS:\s*(\d+) kB$/m;
const BYTES_PER_KIB: number = 1024;

function tryReadStatusResidentBytes(): number | undefined {
  let status: string;
  try {
    status = fs.readFileSync(PROC_SELF_STATUS, 'utf8');
  } catch {
    return undefined;
  }
  const match: RegExpExecArray | null = VM_RSS_LINE_PATTERN.exec(status);
  return match ? Number(match[1]) * BYTES_PER_KIB : undefined;
}

/**
 * The resident memory of this process, in bytes.
 *
 * @remarks
 * On Linux this is `VmRSS` from `/proc/self/status`. `process.memoryUsage().rss` reads the `rss` field of
 * `/proc/self/stat` instead, which the kernel takes from counters that it keeps per CPU and adds up only
 * approximately, so on a host with many CPUs it can be tens of megabytes off. Recent kernels add up `VmRSS`
 * exactly. Elsewhere, or when `/proc/self/status` cannot be read or has no `VmRSS` line, this is
 * `process.memoryUsage.rss()`, and it throws when that does.
 */
export function readResidentMemoryBytes(): number {
  const statusBytes: number | undefined =
    process.platform === 'linux' ? tryReadStatusResidentBytes() : undefined;
  return statusBytes ?? process.memoryUsage.rss();
}
