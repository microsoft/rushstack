// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as process from 'process';
import { performance } from 'perf_hooks';
import { Executable, InternalError } from '@rushstack/node-core-library';

import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IBuildStageContext, ICompileSubstage, IPostBuildSubstage } from '../stages/BuildStage';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { CoreConfigFiles } from '../utilities/CoreConfigFiles';

const PLUGIN_NAME: string = 'ServeCommandPlugin';

export interface IServeCommandPluginCompleteConfiguration {
  enabled: boolean;
  commandName: string;
  ignoreMissingScript: boolean;
  waitBeforeRestartMs: number;
  waitForTerminateMs: number;
  waitForKillMs: number;
}

export interface IServeCommandPluginConfiguration extends Partial<IServeCommandPluginCompleteConfiguration> {}

enum State {
  Stopped,
  Running,
  Stopping,
  Killing
}

export class ServeCommandPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  private _logger!: ScopedLogger;

  private _activeChildProcess: child_process.ChildProcess | undefined;

  private _state: State = State.Stopped;

  private _timeout: NodeJS.Timeout | undefined = undefined;

  private _isWindows!: boolean;

  // The process will be automatically restarted when performance.now() exceeds this time
  private _restartTime: number | undefined = undefined;

  private _configuration!: IServeCommandPluginCompleteConfiguration;
  private _serveCommandConfiguration: IServeCommandPluginConfiguration | undefined = undefined;
  private _shellCommand: string | undefined;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    this._logger = heftSession.requestScopedLogger('node-service');

    this._isWindows = process.platform === 'win32';

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.loadStageConfiguration.tapPromise(PLUGIN_NAME, async () => {
        this._serveCommandConfiguration =
          await CoreConfigFiles.serveCommandConfigurationLoader.tryLoadConfigurationFileForProjectAsync(
            this._logger.terminal,
            heftConfiguration.buildFolder,
            heftConfiguration.rigConfig
          );

        // defaults
        this._configuration = {
          enabled: this._serveCommandConfiguration !== undefined,
          commandName: 'serve',
          ignoreMissingScript: false,
          waitBeforeRestartMs: 2000,
          waitForTerminateMs: 2000,
          waitForKillMs: 2000
        };

        // TODO: @rushstack/heft-config-file should be able to read a *.defaults.json file
        if (this._serveCommandConfiguration) {
          if (this._serveCommandConfiguration.enabled !== undefined) {
            this._configuration.enabled = this._serveCommandConfiguration.enabled;
          }
          if (this._serveCommandConfiguration.commandName !== undefined) {
            this._configuration.commandName = this._serveCommandConfiguration.commandName;
          }
          if (this._serveCommandConfiguration.ignoreMissingScript !== undefined) {
            this._configuration.ignoreMissingScript = this._serveCommandConfiguration.ignoreMissingScript;
          }
          if (this._serveCommandConfiguration.waitBeforeRestartMs !== undefined) {
            this._configuration.waitBeforeRestartMs = this._serveCommandConfiguration.waitBeforeRestartMs;
          }
          if (this._serveCommandConfiguration.waitForTerminateMs !== undefined) {
            this._configuration.waitForTerminateMs = this._serveCommandConfiguration.waitForTerminateMs;
          }
          if (this._serveCommandConfiguration.waitForKillMs !== undefined) {
            this._configuration.waitForKillMs = this._serveCommandConfiguration.waitForKillMs;
          }

          if (!this._configuration.enabled) {
            this._logger.terminal.writeVerboseLine('The plugin is disabled');
          } else {
            this._shellCommand = (heftConfiguration.projectPackageJson.scripts || {})[
              this._configuration.commandName
            ];

            if (this._shellCommand === undefined) {
              if (this._configuration.ignoreMissingScript) {
                this._logger.terminal.writeLine(
                  `The plugin is disabled because the project's package.json` +
                    ` does not have a "${this._configuration.commandName}" script`
                );
              } else {
                this._logger.terminal.writeErrorLine(
                  `The project's package.json does not have a "${this._configuration.commandName}" script`
                );
              }
              this._configuration.enabled = false;
            }
          }
        } else {
          this._logger.terminal.writeVerboseLine(
            'The plugin is disabled because its config file was not found: ' +
              CoreConfigFiles.serveCommandConfigurationLoader.projectRelativeFilePath
          );
        }
      });

      build.hooks.postBuild.tap(PLUGIN_NAME, (bundle: IPostBuildSubstage) => {
        bundle.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runCommandAsync(heftSession, heftConfiguration);
        });
      });

      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.afterEachIteration.tap(PLUGIN_NAME, this._compileHooks_afterEachIteration);
      });
    });
  }

  private async _runCommandAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    if (!this._configuration.enabled) {
      return;
    }

    this._logger.terminal.writeLine(`Starting Node service...`);

    this._restartChild();
  }

  private _compileHooks_afterEachIteration = (): void => {
    if (!this._configuration.enabled) {
      return;
    }

    try {
      if (this._state === State.Stopped) {
        // If we are already stopped, then extend the timeout
        this._scheduleRestart(this._configuration.waitBeforeRestartMs);
      } else {
        this._stopChild();
      }
    } catch (error) {
      console.error('UNCAUGHT: ' + error.toString());
    }
  };

  private _restartChild(): void {
    if (this._state !== State.Stopped) {
      throw new InternalError('Invalid state');
    }

    this._state = State.Running;
    this._clearTimeout();

    this._logger.terminal.writeLine('Invoking command: ' + JSON.stringify(this._shellCommand!));

    this._activeChildProcess = child_process.spawn(this._shellCommand!, {
      shell: true,
      // On POSIX, set detached=true to create a new group so we can terminate
      // the child process's children
      detached: !this._isWindows,
      stdio: ['inherit', 'inherit', 'inherit']
    });
    const childPid: number = this._activeChildProcess.pid;

    this._logger.terminal.writeVerboseLine(`Started child ${childPid}`);

    this._activeChildProcess.on('close', (code: number, signal: string): void => {
      // The 'close' event is emitted after a process has ended and the stdio streams of a child process
      // have been closed. This is distinct from the 'exit' event, since multiple processes might share the
      // same stdio streams. The 'close' event will always emit after 'exit' was already emitted,
      // or 'error' if the child failed to spawn.

      if (this._state === State.Running) {
        this._logger.terminal.writeWarningLine(
          `Child #${childPid} terminated unexpectedly code=${code} signal=${signal}`
        );
        this._transitionToStopped();
        return;
      }

      if (this._state === State.Stopping || this._state === State.Killing) {
        this._logger.terminal.writeVerboseLine(
          `Child #${childPid} terminated successfully code=${code} signal=${signal}`
        );
        this._transitionToStopped();
        return;
      }
    });

    // This is event requires Node.js >= 15.x
    this._activeChildProcess.on('exit', (code: number | null, signal: string | null) => {
      this._logger.terminal.writeVerboseLine(`Got EXIT event code=${code} signal=${signal}`);
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
        this._logger.terminal.writeErrorLine(`Failed to start: ` + err.toString());
        this._transitionToStopped();
        return;
      }

      if (this._state === State.Stopping) {
        this._logger.terminal.writeWarningLine(
          `Child #${childPid} rejected shutdown signal: ` + err.toString()
        );
        this._transitionToKilling();
        return;
      }

      if (this._state === State.Killing) {
        this._logger.terminal.writeErrorLine(`Child #${childPid} rejected kill signal: ` + err.toString());
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
    this._clearTimeout();

    if (this._isWindows) {
      this._logger.terminal.writeVerboseLine('Terminating child process tree');

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
        this._logger.terminal.writeErrorLine('TaskKill.exe failed: ' + result.error.toString());
        this._transitionToStopped();
        return;
      }
    } else {
      this._logger.terminal.writeVerboseLine('Sending SIGTERM');

      // Passing a negative PID terminates the entire group instead of just the one process
      process.kill(-this._activeChildProcess.pid, 'SIGTERM');
    }

    this._clearTimeout();
    this._timeout = setTimeout(() => {
      this._timeout = undefined;
      this._logger.terminal.writeWarningLine('Child is taking too long to terminate');
      this._transitionToKilling();
    }, this._configuration.waitForTerminateMs);
  }

  private _transitionToKilling(): void {
    this._state = State.Killing;
    this._clearTimeout();

    this._logger.terminal.writeVerboseLine('Sending SIGKILL');

    if (!this._activeChildProcess) {
      // All the code paths that set _activeChildProcess=undefined should also leave the Running state
      throw new InternalError('_activeChildProcess should not be undefined');
    }

    this._logger.terminal.writeVerboseLine('Sending SIGKILL');

    if (this._isWindows) {
      process.kill(this._activeChildProcess.pid, 'SIGKILL');
    } else {
      // Passing a negative PID terminates the entire group instead of just the one process
      process.kill(-this._activeChildProcess.pid, 'SIGKILL');
    }

    this._clearTimeout();
    this._timeout = setTimeout(() => {
      this._timeout = undefined;
      this._logger.terminal.writeErrorLine('Abandoning child process because SIGKILL did not work');
      this._transitionToStopped();
    }, this._configuration.waitForKillMs);
  }

  private _transitionToStopped(): void {
    // Failed to start
    this._state = State.Stopped;
    this._clearTimeout();

    this._activeChildProcess = undefined;

    // Once we have stopped, schedule a restart
    this._scheduleRestart(this._configuration.waitBeforeRestartMs);
  }

  private _scheduleRestart(msFromNow: number): void {
    const newTime: number = performance.now() + msFromNow;
    if (this._restartTime === undefined || newTime > this._restartTime) {
      this._restartTime = newTime;
    }
    this._logger.terminal.writeVerboseLine('Extending timeout');

    this._clearTimeout();
    this._timeout = setTimeout(() => {
      this._timeout = undefined;
      this._logger.terminal.writeVerboseLine('Time to restart');
      this._restartChild();
    }, Math.max(0, this._restartTime - performance.now()));
  }

  private _clearTimeout(): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = undefined;
    }
  }
}
