// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';
import process from 'process';

/**
 * When a child process is created, registering it with the SubprocessTerminator will ensure
 * that the child gets terminated when the current process terminates.
 *
 * @remarks
 * This works by hooking the current process's events for SIGTERM/SIGINT/exit, and ensuring the
 * child process gets terminated in those cases.
 *
 * SubprocessTerminator doesn't do anything on Windows, since by default Windows automatically
 * terminates child processes when their parent is terminated.
 */
export class SubprocessTerminator {
  /**
   * Whether the hooks are installed
   */
  private static _initialized: boolean = false;

  /**
   * The list of registered child processes.  Processes are removed from this set if they
   * terminate on their own.
   */
  private static _childPids: Set<number> = new Set();

  /**
   * Registers a child process so that it will be terminated automatically if the current process
   * is terminated.
   */
  public static registerChildProcess(subprocess: childProcess.ChildProcess): void {
    if (process.platform === 'win32') {
      // Windows works differently from other OS's:
      // - Bad news: Calls to "process.kill(childPid, 'SIGTERM')" fail with ESRCH because the OS doesn't
      //   really support POSIX signals
      // - Good news: By default, child processes are terminated if their parent terminates, so we don't
      //   really need SubprocessTerminator on Windows
      return;
    }

    SubprocessTerminator._ensureInitialized();

    // Avoid capturing subprocess in the closure
    const childPid: number = subprocess.pid;
    SubprocessTerminator._childPids.add(childPid);

    SubprocessTerminator._logDebug(`tracking #${childPid}`);

    subprocess.on('close', (code: number, signal: string): void => {
      SubprocessTerminator._logDebug(`untracking #${childPid}`);
      SubprocessTerminator._childPids.delete(subprocess.pid);
    });
  }

  // Install the hooks
  private static _ensureInitialized(): void {
    if (!SubprocessTerminator._initialized) {
      SubprocessTerminator._initialized = true;

      SubprocessTerminator._logDebug('initialize');

      process.prependListener('SIGTERM', SubprocessTerminator._onTerminateSignal);
      process.prependListener('SIGINT', SubprocessTerminator._onTerminateSignal);

      process.prependListener('exit', SubprocessTerminator._onExit);
    }
  }

  // Uninstall the hooks and perform cleanup
  private static _cleanupChildProcesses(): void {
    if (SubprocessTerminator._initialized) {
      SubprocessTerminator._initialized = false;

      process.removeListener('SIGTERM', SubprocessTerminator._onTerminateSignal);
      process.removeListener('SIGINT', SubprocessTerminator._onTerminateSignal);

      const childPids: number[] = Array.from(SubprocessTerminator._childPids);
      SubprocessTerminator._childPids.clear();
      for (const childPid of childPids) {
        SubprocessTerminator._logDebug(`terminating #${childPid}`);
        process.kill(childPid, 'SIGTERM');
      }
    }
  }

  private static _onExit(exitCode: number): void {
    SubprocessTerminator._logDebug(`received exit(${exitCode})`);

    SubprocessTerminator._cleanupChildProcesses();

    SubprocessTerminator._logDebug(`finished exit()`);
  }

  private static _onTerminateSignal(signal: string): void {
    SubprocessTerminator._logDebug(`received signal ${signal}`);

    SubprocessTerminator._cleanupChildProcesses();

    // When a listener is added to SIGTERM, Node.js strangely provides no way to reference
    // the original handler.  But we can invoke it by removing our listener and then resending
    // the signal to our own process.
    SubprocessTerminator._logDebug(`relaying ${signal}`);
    process.kill(process.pid, signal);
  }

  // For debugging
  private static _logDebug(message: string): void {
    // const logLine: string = `SubprocessTerminator: [${process.pid}] ${message}`;
    // fs.writeFileSync('trace.log', logLine + '\n', { flag: 'a' });
    // console.log(logLine);
  }
}
