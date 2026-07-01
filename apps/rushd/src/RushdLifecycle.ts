// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import * as process from 'node:process';

/**
 * Default idle timeout in milliseconds (30 minutes).
 */
export const DEFAULT_IDLE_TIMEOUT_MS: number = 30 * 60 * 1000;

/**
 * Get the named pipe / Unix socket path for a given workspace.
 * Each workspace gets its own daemon.
 */
export function getPipePath(workspaceRoot: string): string {
  const hash: string = crypto.createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 12);

  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\rushd-${hash}`;
  } else {
    return `/tmp/rushd-${hash}.sock`;
  }
}

/**
 * Get the directory where rushd stores runtime files (PID, logs).
 */
export function getRushdDir(workspaceRoot: string): string {
  const hash: string = crypto.createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 12);
  const homeDir: string = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(homeDir, '.rushd', hash);
}

/**
 * Get the PID file path for a workspace.
 */
export function getPidFilePath(workspaceRoot: string): string {
  return path.join(getRushdDir(workspaceRoot), 'pid');
}

/**
 * Write the current process PID to the PID file.
 */
export function writePidFile(workspaceRoot: string): void {
  const dir: string = getRushdDir(workspaceRoot);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getPidFilePath(workspaceRoot), String(process.pid), 'utf-8');
}

/**
 * Read the daemon PID from the PID file, or undefined if not found.
 */
export function readPidFile(workspaceRoot: string): number | undefined {
  const pidPath: string = getPidFilePath(workspaceRoot);
  try {
    const content: string = fs.readFileSync(pidPath, 'utf-8').trim();
    const pid: number = parseInt(content, 10);
    return isNaN(pid) ? undefined : pid;
  } catch {
    return undefined;
  }
}

/**
 * Remove the PID file.
 */
export function removePidFile(workspaceRoot: string): void {
  try {
    fs.unlinkSync(getPidFilePath(workspaceRoot));
  } catch {
    // Ignore if already removed
  }
}

/**
 * Check if a process with the given PID is running.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks existence without killing
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a daemon is actually listening on the pipe by attempting a connection.
 * Returns true if a daemon responds, false if the pipe is stale.
 */
export function isDaemonAlive(workspaceRoot: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const pipePath: string = getPipePath(workspaceRoot);
    const client: net.Socket = net.connect(pipePath, () => {
      // Connected — daemon is alive
      client.end();
      resolve(true);
    });
    client.on('error', () => {
      resolve(false);
    });
    // Timeout after 2 seconds
    client.setTimeout(2000, () => {
      client.destroy();
      resolve(false);
    });
  });
}

/**
 * Remove a stale socket file on macOS/Linux.
 * Windows named pipes are kernel-managed and auto-cleaned.
 */
export function removeStaleSocket(workspaceRoot: string): void {
  if (process.platform === 'win32') {
    return;
  }
  const pipePath: string = getPipePath(workspaceRoot);
  try {
    fs.unlinkSync(pipePath);
  } catch {
    // Ignore if doesn't exist
  }
}
