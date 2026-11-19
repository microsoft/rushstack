// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

/** The open file flag that Linux reports in /proc/self/fdinfo for a descriptor marked close-on-exec. */
const LINUX_O_CLOEXEC: number = 0o2000000;

/**
 * Lists the file descriptors above stderr that a program this process starts would inherit: those not marked
 * close-on-exec, other than the IPC channel.
 *
 * @remarks
 * Node marks descriptors 0 through 15 close-on-exec when it starts, and then each later one up to the first that
 * is closed. A descriptor after that gap stays inheritable, for example the pipe of a bash process substitution
 * (`2> >(sed …)`, usually descriptor 63) or a lock file that a script opened with `exec 200>file`.
 *
 * Returns `undefined` when it cannot tell: on any platform but Linux, or when /proc/self/fdinfo does not show
 * close-on-exec on a descriptor that Node opened (Node opens every descriptor close-on-exec).
 */
export function listInheritedFileDescriptors(): number[] | undefined {
  if (process.platform !== 'linux') return undefined;
  const probe: number = fs.openSync('/dev/null', 'r');
  try {
    const probeFlags: number | undefined = readFileDescriptorFlags(probe);
    if (probeFlags === undefined || !isCloseOnExec(probeFlags)) return undefined;
  } finally {
    fs.closeSync(probe);
  }
  // @types/node does not declare the descriptor of the IPC channel.
  const channelFd: number | undefined = (process.channel as { fd?: number } | undefined)?.fd;
  const inherited: number[] = [];
  for (const entry of fs.readdirSync('/proc/self/fd')) {
    const fd: number = Number(entry);
    if (fd <= 2 || fd === channelFd) continue;
    const flags: number | undefined = readFileDescriptorFlags(fd);
    // For example the descriptor that listed the folder, which is closed by now.
    if (flags === undefined) continue;
    if (!isCloseOnExec(flags)) inherited.push(fd);
  }
  return inherited;
}

/**
 * Closes the file descriptors that {@link listInheritedFileDescriptors} lists, so that a program this process
 * starts does not inherit them, and returns them. Returns `undefined`, and closes nothing, where they cannot be
 * listed.
 */
export function closeInheritedFileDescriptors(): number[] | undefined {
  const inherited: number[] | undefined = listInheritedFileDescriptors();
  for (const fd of inherited ?? []) {
    try {
      fs.closeSync(fd);
    } catch {
      // Linux releases a descriptor even when closing it reports an error.
    }
  }
  return inherited;
}

/** Whether the flags include O_CLOEXEC, which is a single bit. */
function isCloseOnExec(flags: number): boolean {
  return Math.floor(flags / LINUX_O_CLOEXEC) % 2 === 1;
}

/** Reads the open file flags of a descriptor of this process, or `undefined` if it is not open. */
function readFileDescriptorFlags(fd: number): number | undefined {
  let fdinfo: string;
  try {
    fdinfo = fs.readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  const match: RegExpMatchArray | null = fdinfo.match(/^flags:\s*([0-7]+)$/m);
  return match ? parseInt(match[1], 8) : undefined;
}
