// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'node:child_process';
import * as process from 'node:process';

import { InternalError, SubprocessTerminator } from '@rushstack/node-core-library';

import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin.ts';
import type { HeftConfiguration } from '../configuration/HeftConfiguration.ts';
import type {
  IHeftTaskSession,
  IHeftTaskRunIncrementalHookOptions
} from '../pluginFramework/HeftTaskSession.ts';
import type { IScopedLogger } from '../pluginFramework/logging/ScopedLogger.ts';
import { CoreConfigFiles } from '../utilities/CoreConfigFiles.ts';

const PLUGIN_NAME: 'node-service-plugin' = 'node-service-plugin';
const SERVE_PARAMETER_LONG_NAME: '--serve' = '--serve';

export interface INodeServicePluginCompleteConfiguration {
  commandName: string;
  ignoreMissingScript: boolean;
  waitForTerminateMs: number;
  waitForKillMs: number;
}

export interface INodeServicePluginConfiguration extends Partial<INodeServicePluginCompleteConfiguration> {}

enum State {
  /**
   * The service process is not running, and _activeChildProcess is undefined.
   *
   * In this state, there may or may not be a timeout scheduled that will later restart the service.
   */
  Stopped,

  /**
   * The service process is running normally.
   */
  Running,

  /**
   * The SIGTERM signal has been sent to the service process, and we are waiting for it
   * to shut down gracefully.
   *
   * NOTE: On Windows OS, SIGTERM is skipped and we proceed directly to SIGKILL.
   */
  Stopping,

  /**
   * The SIGKILL signal has been sent to forcibly terminate the service process, and we are waiting
   * to confirm that the operation has completed.
   */
  Killing
}

export default class NodeServicePlugin implements IHeftTaskPlugin {
  private static readonly _isWindows: boolean = process.platform === 'win32';

  private _activeChildProcess: child_process.ChildProcess | undefined;
  private _childProcessExitPromise: Promise<void> | undefined;
  private _childProcessExitPromiseResolveFn: (() => void) | undefined;
  private _childProcessExitPromiseRejectFn: ((e: unknown) => void) | undefined;
  private _state: State = State.Stopped;
  private _logger!: IScopedLogger;

  /**
   * The state machine schedules at most one setInterval() timeout at any given time.  It is for:
   *
   * - waitForTerminateMs in State.Stopping
   * - waitForKillMs in State.Killing
   */
  private _timeout: NodeJS.Timeout | undefined = undefined;

  /**
   * The data read from the node-service.json config file, or "undefined" if the file is missing.
   */
  private _rawConfiguration: INodeServicePluginConfiguration | undefined = undefined;

  /**
   * The effective configuration, with defaults applied.
   */
  private _configuration!: INodeServicePluginCompleteConfiguration;

  /**
   * The script body obtained from the "scripts" section in the project's package.json.
   */
  private _shellCommand: string | undefined;

  private _pluginEnabled: boolean = false;

  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    // Set this immediately to make it available to the internal methods that use it
    this._logger = taskSession.logger;

    const isServeMode: boolean = taskSession.parameters.getFlagParameter(SERVE_PARAMETER_LONG_NAME).value;

    if (isServeMode && !taskSession.parameters.watch) {
      throw new Error(
        `The ${JSON.stringify(
          SERVE_PARAMETER_LONG_NAME
        )} parameter is only available when running in watch mode.` +
          ` Try replacing "${taskSession.parsedCommandLine?.unaliasedCommandName}" with` +
          ` "${taskSession.parsedCommandLine?.unaliasedCommandName}-watch" in your Heft command line.`
      );
    }

    if (!isServeMode) {
      taskSession.logger.terminal.writeVerboseLine(
        `Not launching the service because the "${SERVE_PARAMETER_LONG_NAME}" parameter was not specified`
      );
      return;
    }

    taskSession.hooks.runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runIncrementalOptions: IHeftTaskRunIncrementalHookOptions) => {
        await this._runCommandAsync(taskSession, heftConfiguration);
      }
    );
  }

  private async _loadStageConfigurationAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    if (!this._rawConfiguration) {
      this._rawConfiguration = await CoreConfigFiles.tryLoadNodeServiceConfigurationFileAsync(
        taskSession.logger.terminal,
        heftConfiguration.buildFolderPath,
        heftConfiguration.rigConfig
      );

      // defaults
      this._configuration = {
        commandName: 'serve',
        ignoreMissingScript: false,
        waitForTerminateMs: 2000,
        waitForKillMs: 2000
      };

      // TODO: @rushstack/heft-config-file should be able to read a *.defaults.json file
      if (this._rawConfiguration) {
        this._pluginEnabled = true;

        if (this._rawConfiguration.commandName !== undefined) {
          this._configuration.commandName = this._rawConfiguration.commandName;
        }
        if (this._rawConfiguration.ignoreMissingScript !== undefined) {
          this._configuration.ignoreMissingScript = this._rawConfiguration.ignoreMissingScript;
        }
        if (this._rawConfiguration.waitForTerminateMs !== undefined) {
          this._configuration.waitForTerminateMs = this._rawConfiguration.waitForTerminateMs;
        }
        if (this._rawConfiguration.waitForKillMs !== undefined) {
          this._configuration.waitForKillMs = this._rawConfiguration.waitForKillMs;
        }

        this._shellCommand = (heftConfiguration.projectPackageJson.scripts || {})[
          this._configuration.commandName
        ];

        if (this._shellCommand === undefined) {
          if (this._configuration.ignoreMissingScript) {
            taskSession.logger.terminal.writeLine(
              `The node service cannot be started because the project's package.json` +
                ` does not have a "${this._configuration.commandName}" script`
            );
          } else {
            throw new Error(
              `The node service cannot be started because the project's package.json ` +
                `does not have a "${this._configuration.commandName}" script`
            );
          }
          this._pluginEnabled = false;
        }
      } else {
        throw new Error(
          'The node service cannot be started because the task config file was not found: ' +
            CoreConfigFiles.nodeServiceConfigurationProjectRelativeFilePath
        );
      }
    }
  }

  private async _runCommandAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    await this._loadStageConfigurationAsync(taskSession, heftConfiguration);
    if (!this._pluginEnabled) {
      return;
    }

    this._logger.terminal.writeLine(`Starting Node service...`);
    await this._stopChildAsync();
    this._startChild();
  }

  private async _stopChildAsync(): Promise<void> {
    if (this._state !== State.Running) {
      if (this._childProcessExitPromise) {
        // If we have an active process but are not in the running state, we must be in the process of
        // terminating or the process is already stopped.
        await this._childProcessExitPromise;
      }
      return;
    }

    if (NodeServicePlugin._isWindows) {
      // On Windows, SIGTERM can kill Cmd.exe and leave its children running in the background
      this._transitionToKilling();
    } else {
      if (!this._activeChildProcess) {
        // All the code paths that set _activeChildProcess=undefined should also leave the Running state
        throw new InternalError('_activeChildProcess should not be undefined');
      }

      this._state = State.Stopping;
      this._logger.terminal.writeVerboseLine('Sending SIGTERM to gracefully shut down the service process');

      // Passing a negative PID terminates the entire group instead of just the one process.
      // This works because we set detached=true for child_process.spawn()

      const pid: number | undefined = this._activeChildProcess.pid;
      if (pid !== undefined) {
        // If pid was undefined, the process failed to spawn
        process.kill(-pid, 'SIGTERM');
      }

      this._clearTimeout();
      this._timeout = setTimeout(() => {
        try {
          if (this._state !== State.Stopped) {
            this._logger.terminal.writeWarningLine('The service process is taking too long to terminate');
            this._transitionToKilling();
          }
        } catch (e: unknown) {
          this._childProcessExitPromiseRejectFn!(e);
        }
      }, this._configuration.waitForTerminateMs);
    }

    await this._childProcessExitPromise;
  }

  private _transitionToKilling(): void {
    this._state = State.Killing;

    if (!this._activeChildProcess) {
      // All the code paths that set _activeChildProcess=undefined should also leave the Running state
      throw new InternalError('_activeChildProcess should not be undefined');
    }

    this._logger.terminal.writeVerboseLine('Attempting to killing the service process');

    SubprocessTerminator.killProcessTree(this._activeChildProcess, SubprocessTerminator.RECOMMENDED_OPTIONS);

    this._clearTimeout();
    this._timeout = setTimeout(() => {
      try {
        if (this._state !== State.Stopped) {
          this._logger.terminal.writeErrorLine(
            'Abandoning the service process because it could not be killed'
          );
          this._transitionToStopped();
        }
      } catch (e: unknown) {
        this._childProcessExitPromiseRejectFn!(e);
      }
    }, this._configuration.waitForKillMs);
  }

  private _transitionToStopped(): void {
    // Failed to start
    this._state = State.Stopped;
    this._clearTimeout();
    this._activeChildProcess = undefined;
    this._childProcessExitPromiseResolveFn!();
  }

  private _startChild(): void {
    if (this._state !== State.Stopped) {
      throw new InternalError('Invalid state');
    }

    this._state = State.Running;
    this._clearTimeout();
    this._logger.terminal.writeLine(`Invoking command: "${this._shellCommand!}"`);

    const childProcess: child_process.ChildProcess = child_process.spawn(this._shellCommand!, {
      shell: true,
      ...SubprocessTerminator.RECOMMENDED_OPTIONS
    });
    SubprocessTerminator.killProcessTreeOnExit(childProcess, SubprocessTerminator.RECOMMENDED_OPTIONS);

    const childPid: number | undefined = childProcess.pid;
    if (childPid === undefined) {
      throw new InternalError(`Failed to spawn child process`);
    }
    this._logger.terminal.writeVerboseLine(`Started service process #${childPid}`);

    // Create a promise that resolves when the child process exits
    this._childProcessExitPromise = new Promise<void>((resolve, reject) => {
      this._childProcessExitPromiseResolveFn = resolve;
      this._childProcessExitPromiseRejectFn = reject;

      childProcess.stdout?.on('data', (data: Buffer) => {
        this._logger.terminal.write(data.toString());
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        this._logger.terminal.writeError(data.toString());
      });

      childProcess.on('close', (exitCode: number | null, signal: NodeJS.Signals | null): void => {
        try {
          // The 'close' event is emitted after a process has ended and the stdio streams of a child process
          // have been closed. This is distinct from the 'exit' event, since multiple processes might share the
          // same stdio streams. The 'close' event will always emit after 'exit' was already emitted,
          // or 'error' if the child failed to spawn.

          if (this._state === State.Running) {
            this._logger.terminal.writeWarningLine(
              `The service process #${childPid} terminated unexpectedly` +
                this._formatCodeOrSignal(exitCode, signal)
            );
            this._transitionToStopped();
            return;
          }

          if (this._state === State.Stopping || this._state === State.Killing) {
            this._logger.terminal.writeVerboseLine(
              `The service process #${childPid} terminated successfully` +
                this._formatCodeOrSignal(exitCode, signal)
            );
            this._transitionToStopped();
            return;
          }
        } catch (e: unknown) {
          reject(e);
        }
      });

      childProcess.on('exit', (code: number | null, signal: string | null) => {
        try {
          // Under normal conditions we don't reject the promise here, because 'data' events can continue
          // to fire as data is flushed, before finally concluding with the 'close' event.
          this._logger.terminal.writeVerboseLine(
            `The service process fired its "exit" event` + this._formatCodeOrSignal(code, signal)
          );
        } catch (e: unknown) {
          reject(e);
        }
      });

      childProcess.on('error', (err: Error) => {
        try {
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
              `The service process #${childPid} rejected the shutdown signal: ` + err.toString()
            );
            this._transitionToKilling();
            return;
          }

          if (this._state === State.Killing) {
            this._logger.terminal.writeErrorLine(
              `The service process #${childPid} could not be killed: ` + err.toString()
            );
            this._transitionToStopped();
            return;
          }
        } catch (e: unknown) {
          reject(e);
        }
      });
    });

    this._activeChildProcess = childProcess;
  }

  private _clearTimeout(): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = undefined;
    }
  }

  private _formatCodeOrSignal(code: number | null | undefined, signal: string | null | undefined): string {
    if (signal) {
      return ` (signal=${code})`;
    }
    if (typeof code === 'number') {
      return ` (exit code ${code})`;
    }
    return '';
  }
}
