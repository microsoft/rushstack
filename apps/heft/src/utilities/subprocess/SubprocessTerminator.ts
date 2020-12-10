// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';
import process from 'process';

export class SubprocessTerminator {
  private static _initialized: boolean = false;
  private static _childPids: Set<number> = new Set();

  private static _logDebug(message: string): void {
    // const logLine: string = `SubprocessTerminator: [${process.pid}] ${message}`;
    // fs.writeFileSync('trace.log', logLine + '\n', { flag: 'a' });
    // console.log(logLine);
  }

  private static _ensureInitialized(): void {
    if (!SubprocessTerminator._initialized) {
      SubprocessTerminator._initialized = true;

      SubprocessTerminator._logDebug('initialize');

      process.prependListener('SIGTERM', SubprocessTerminator._onTerminateSignal);
      process.prependListener('SIGINT', SubprocessTerminator._onTerminateSignal);

      process.prependListener('exit', SubprocessTerminator._onExit);
    }
  }

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

  public static terminateWithCurrentProcess(subprocess: childProcess.ChildProcess): void {
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
}
