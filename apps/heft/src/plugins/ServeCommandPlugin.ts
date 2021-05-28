// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as process from 'process';
import { Executable, InternalError } from '@rushstack/node-core-library';

import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IBuildStageContext, ICompileSubstage, IPostBuildSubstage } from '../stages/BuildStage';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';

const PLUGIN_NAME: string = 'serve-command-plugin';

enum State {
  Stopped,
  WaitingToRestart,
  Running,
  Stopping,
  Killing
}

export class ServeCommandPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  private _logger!: ScopedLogger;

  private _activeChildProcess: child_process.ChildProcess | undefined;

  private _serveCommand!: string;

  private _state: State = State.Stopped;

  private _timeout: NodeJS.Timeout | undefined = undefined;

  private _isWindows!: boolean;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    this._logger = heftSession.requestScopedLogger('serve-command');

    this._isWindows = process.platform === 'win32';

    this._serveCommand = heftConfiguration.projectPackageJson.scripts?.serve || '';
    if (this._serveCommand) {
      heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
        build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
          compile.hooks.afterEachIteration.tap(PLUGIN_NAME, this._compileHooks_afterEachIteration);
        });

        build.hooks.postBuild.tap(PLUGIN_NAME, (bundle: IPostBuildSubstage) => {
          bundle.hooks.run.tapPromise(PLUGIN_NAME, async () => {
            await this._runCommandAsync(heftSession, heftConfiguration);
          });
        });
      });
    }
  }

  private _compileHooks_afterEachIteration = (): void => {
    try {
      this._stopChild();
    } catch (error) {
      console.error('UNCAUGHT: ' + error.toString());
    }
  };

  private async _runCommandAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    this._logger.terminal.writeLine(`serve-command-plugin started`);

    this._restartChild();
  }

  private _restartChild(): void {
    if (this._state !== State.Stopped && this._state !== State.WaitingToRestart) {
      throw new InternalError('Invalid state');
    }

    this._state = State.Running;
    this._logger.terminal.writeLine('Invoking command: ' + JSON.stringify(this._serveCommand));

    this._activeChildProcess = child_process.spawn(this._serveCommand, {
      shell: true,
      // On POSIX, set detched=true to create a new group so we can terminate
      // the child process's children
      detached: !this._isWindows,
      stdio: ['inherit', 'inherit', 'inherit']
    });
    const childPid: number = this._activeChildProcess.pid;

    this._logger.terminal.writeLine(`Started child ${childPid}`);

    this._activeChildProcess.on('close', (code: number, signal: string): void => {
      // The 'close' event is emitted after a process has ended and the stdio streams of a child process
      // have been closed. This is distinct from the 'exit' event, since multiple processes might share the
      // same stdio streams. The 'close' event will always emit after 'exit' was already emitted,
      // or 'error' if the child failed to spawn.

      if (this._state === State.Running) {
        this._logger.terminal.writeLine(
          `Child #${childPid} terminated unexpectedly code=${code} signal=${signal}`
        );
        this._transitionToStopped();
        return;
      }

      if (this._state === State.Stopping || this._state === State.Killing) {
        this._logger.terminal.writeLine(
          `Child #${childPid} terminated successfully code=${code} signal=${signal}`
        );
        this._transitionToStopped();
        return;
      }
    });

    this._activeChildProcess.on('exit', (code: number | null, signal: string | null) => {
      this._logger.terminal.writeLine(`Got EXIT event code=${code} signal=${signal}`);
    });

    this._activeChildProcess.on('error', (err: Error) => {
      // "The 'error' event is emitted whenever:
      // 1. The process could not be spawned, or
      // 2. The process could not be killed, or
      // 3. Sending a message to the child process failed.
      //
      // The 'exit' event may or may not fire after an error has occurred. When listening to both the 'exit'
      // and 'error' events, guard against accidentally invoking handler functions multiple times."

      if (this._state === State.Running) {
        this._logger.terminal.writeLine(`Failed to start: ` + err.toString());
        this._transitionToStopped();
        return;
      }

      if (this._state === State.Stopping) {
        this._logger.terminal.writeLine(`Child #${childPid} rejected shutdown signal: ` + err.toString());
        this._transitionToKilling();
        return;
      }

      if (this._state === State.Killing) {
        this._logger.terminal.writeLine(`Child #${childPid} rejected kill signal: ` + err.toString());
        this._transitionToStopped();
        return;
      }
    });
  }

  private _stopChild(): void {
    if (this._state !== State.Running) {
      return;
    }

    if (!this._activeChildProcess) {
      // All the code paths that set _activeChildProcess=undefined should also leave the Running state
      throw new InternalError('_activeChildProcess should not be undefined');
    }

    this._state = State.Stopping;

    if (this._isWindows) {
      this._logger.terminal.writeLine('Terminating child process tree');

      // On Windows we have a problem that CMD.exe launches child processes, but when CMD.exe is killed
      // the child processes may continue running.  Also if we send signals to CMD.exe the child processes
      // will not receive them.  The safest solution is not to attempt a graceful shutdown, but simply
      // kill the entire process tree.
      const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync('TaskKill.exe', [
        '/T', // "Terminates the specified process and any child processes which were started by it."
        '/F', // Without this, TaskKill will try to use WM_CLOSE which doesn't work with CLI tools
        '/PID',
        this._activeChildProcess.pid.toString()
      ]);

      if (result.error) {
        this._logger.terminal.writeLine('TaskKill.exe failed: ' + result.error.toString());
        this._transitionToStopped();
        return;
      }
      this._logger.terminal.writeLine('Done invoking TaskKill');
    } else {
      this._logger.terminal.writeLine('Sending SIGTERM');

      // Passing a negative PID terminates the entire group instead of just the one process
      process.kill(-this._activeChildProcess.pid, 'SIGTERM');
    }

    this._clearTimeout();
    this._timeout = setTimeout(() => {
      this._timeout = undefined;
      this._logger.terminal.writeLine('Child is taking too long to terminate');
      this._transitionToKilling();
    }, 6000);
  }

  private _transitionToKilling(): void {
    this._state = State.Killing;
    this._logger.terminal.writeLine('Sending SIGKILL');

    if (!this._activeChildProcess) {
      // All the code paths that set _activeChildProcess=undefined should also leave the Running state
      throw new InternalError('_activeChildProcess should not be undefined');
    }

    this._logger.terminal.writeLine('Sending SIGKILL');

    if (this._isWindows) {
      process.kill(this._activeChildProcess.pid, 'SIGKILL');
    } else {
      // Passing a negative PID terminates the entire group instead of just the one process
      process.kill(-this._activeChildProcess.pid, 'SIGKILL');
    }

    this._clearTimeout();
    this._timeout = setTimeout(() => {
      this._timeout = undefined;
      this._logger.terminal.writeLine('Abandoning child process because SIGKILL did not work');
      this._transitionToStopped();
    }, 6000);
  }

  private _transitionToStopped(): void {
    // Failed to start
    this._state = State.Stopped;
    this._activeChildProcess = undefined;
    this._clearTimeout();
  }

  private _clearTimeout(): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = undefined;
    }
  }
}
