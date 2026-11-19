// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as child_process from 'node:child_process';
import process from 'node:process';

import { Executable } from './Executable';

/**
 * Details about how the `child_process.ChildProcess` was created.
 *
 * @beta
 */
export interface ISubprocessOptions {
  /**
   * Whether or not the child process was started in detached mode.
   *
   * @remarks
   * On POSIX systems, detached=true is required for killing the subtree. Attempting to kill the
   * subtree on POSIX systems with detached=false will throw an error. On Windows, detached=true
   * creates a separate console window and is not required for killing the subtree. In general,
   * it is recommended to use SubprocessTerminator.RECOMMENDED_OPTIONS when forking or spawning
   * a child process.
   */
  detached: boolean;
}

interface ITrackedSubprocess {
  subprocess: child_process.ChildProcess;
  subprocessOptions: ISubprocessOptions;
}

/**
 * Whether the hooks are installed
 */
let _initialized: boolean = false;

/**
 * The list of registered child processes.  Processes are removed from this set if they
 * terminate on their own.
 */
const _subprocessesByPid: Map<number, ITrackedSubprocess> = new Map();

const _isWindows: boolean = process.platform === 'win32';

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
 *
 * @beta
 */
export class SubprocessTerminator {
  /**
   * The recommended options when creating a child process.
   */
  public static readonly RECOMMENDED_OPTIONS: ISubprocessOptions = {
    detached: process.platform !== 'win32'
  };

  /**
   * Registers a child process so that it will be terminated automatically if the current process
   * is terminated.
   */
  public static killProcessTreeOnExit(
    subprocess: child_process.ChildProcess,
    subprocessOptions: ISubprocessOptions
  ): void {
    if (typeof subprocess.exitCode === 'number') {
      // Process has already been killed
      return;
    }

    _validateSubprocessOptions(subprocessOptions);

    _ensureInitialized();

    // Closure variable
    const pid: number | undefined = subprocess.pid;
    if (pid === undefined) {
      // The process failed to spawn.
      return;
    }

    subprocess.on('close', (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (_subprocessesByPid.delete(pid)) {
        _logDebug(`untracking #${pid}`);
      }
    });
    _subprocessesByPid.set(pid, {
      subprocess,
      subprocessOptions
    });

    _logDebug(`tracking #${pid}`);
  }

  /**
   * Terminate the child process and all of its children.
   */
  public static killProcessTree(
    subprocess: child_process.ChildProcess,
    subprocessOptions: ISubprocessOptions
  ): void {
    const pid: number | undefined = subprocess.pid;
    if (pid === undefined) {
      // The process failed to spawn.
      return;
    }

    // Don't attempt to kill the same process twice
    if (_subprocessesByPid.delete(pid)) {
      _logDebug(`untracking #${pid} via killProcessTree()`);
    }

    _validateSubprocessOptions(subprocessOptions);

    if (typeof subprocess.exitCode === 'number') {
      // Process has already been killed
      return;
    }

    _logDebug(`terminating #${pid}`);

    if (_isWindows) {
      // On Windows we have a problem that CMD.exe launches child processes, but when CMD.exe is killed
      // the child processes may continue running.  Also if we send signals to CMD.exe the child processes
      // will not receive them.  The safest solution is not to attempt a graceful shutdown, but simply
      // kill the entire process tree.
      const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync('TaskKill.exe', [
        '/T', // "Terminates the specified process and any child processes which were started by it."
        '/F', // Without this, TaskKill will try to use WM_CLOSE which doesn't work with CLI tools
        '/PID',
        pid.toString()
      ]);

      if (result.status) {
        const output: string = result.output.join('\n');
        // Nonzero exit code
        if (output.indexOf('not found') >= 0) {
          // The PID does not exist
        } else {
          // Another error occurred, for example TaskKill.exe does not support
          // the expected CLI syntax
          throw new Error(`TaskKill.exe returned exit code ${result.status}:\n` + output + '\n');
        }
      }
    } else {
      // Passing a negative PID terminates the entire group instead of just the one process
      process.kill(-pid, 'SIGKILL');
    }
  }
}

function _ensureInitialized(): void {
  if (!_initialized) {
    _initialized = true;

    _logDebug('initialize');

    process.prependListener('SIGTERM', _onTerminateSignal);
    process.prependListener('SIGINT', _onTerminateSignal);

    process.prependListener('exit', _onExit);
  }
}

// Uninstall the hooks and perform cleanup
function _cleanupChildProcesses(): void {
  if (_initialized) {
    _initialized = false;

    process.removeListener('SIGTERM', _onTerminateSignal);
    process.removeListener('SIGINT', _onTerminateSignal);

    const trackedSubprocesses: ITrackedSubprocess[] = Array.from(_subprocessesByPid.values());

    let firstError: Error | undefined = undefined;

    for (const trackedSubprocess of trackedSubprocesses) {
      try {
        SubprocessTerminator.killProcessTree(trackedSubprocess.subprocess, { detached: true });
      } catch (error) {
        if (firstError === undefined) {
          firstError = error as Error;
        }
      }
    }

    if (firstError !== undefined) {
      // This is generally an unexpected error such as the TaskKill.exe command not being found,
      // not a trivial issue such as a nonexistent PID.   Since this occurs during process shutdown,
      // we should not interfere with control flow by throwing an exception  or calling process.exit().
      // So simply write to STDERR and ensure our exit code indicates the problem.
      // eslint-disable-next-line no-console
      console.error('\nAn unexpected error was encountered while attempting to clean up child processes:');
      // eslint-disable-next-line no-console
      console.error(firstError.toString());
      if (!process.exitCode) {
        process.exitCode = 1;
      }
    }
  }
}

function _validateSubprocessOptions(subprocessOptions: ISubprocessOptions): void {
  if (!_isWindows) {
    if (!subprocessOptions.detached) {
      // Setting detached=true is what creates the process group that we use to kill the children
      throw new Error('killProcessTree() requires detached=true on this operating system');
    }
  }
}

function _onExit(exitCode: number): void {
  _logDebug(`received exit(${exitCode})`);

  _cleanupChildProcesses();

  _logDebug(`finished exit()`);
}

function _onTerminateSignal(signal: string): void {
  _logDebug(`received signal ${signal}`);

  _cleanupChildProcesses();

  // When a listener is added to SIGTERM, Node.js strangely provides no way to reference
  // the original handler.  But we can invoke it by removing our listener and then resending
  // the signal to our own process.
  _logDebug(`relaying ${signal}`);
  process.kill(process.pid, signal);
}

// For debugging
function _logDebug(message: string): void {
  //const logLine: string = `SubprocessTerminator: [${process.pid}] ${message}`;
  // fs.writeFileSync('trace.log', logLine + '\n', { flag: 'a' });
  //console.log(logLine);
}
