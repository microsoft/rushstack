// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'node:child_process';
import * as process from 'node:process';

import { InternalError, SubprocessTerminator } from '@rushstack/node-core-library';

import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type {
  IHeftTaskSession,
  IHeftTaskRunIncrementalHookOptions
} from '../pluginFramework/HeftTaskSession';
import type { IScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { CoreConfigFiles } from '../utilities/CoreConfigFiles';

const PLUGIN_NAME: 'node-service-plugin' = 'node-service-plugin';
const SERVE_PARAMETER_LONG_NAME: '--serve' = '--serve';

const _isWindows: boolean = process.platform === 'win32';

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
  #activeChildProcess: child_process.ChildProcess | undefined;
  #childProcessExitPromise: Promise<void> | undefined;
  #childProcessExitPromiseResolveFn: (() => void) | undefined;
  #childProcessExitPromiseRejectFn: ((e: unknown) => void) | undefined;
  #state: State = State.Stopped;
  #logger!: IScopedLogger;

  /**
   * The state machine schedules at most one setInterval() timeout at any given time.  It is for:
   *
   * - waitForTerminateMs in State.Stopping
   * - waitForKillMs in State.Killing
   */
  #timeout: NodeJS.Timeout | undefined = undefined;

  /**
   * The data read from the node-service.json config file, or "undefined" if the file is missing.
   */
  #rawConfiguration: INodeServicePluginConfiguration | undefined = undefined;

  /**
   * The effective configuration, with defaults applied.
   */
  #configuration!: INodeServicePluginCompleteConfiguration;

  /**
   * The script body obtained from the "scripts" section in the project's package.json.
   */
  #shellCommand: string | undefined;

  #pluginEnabled: boolean = false;

  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    // Set this immediately to make it available to the internal methods that use it
    this.#logger = taskSession.logger;

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
    if (!this.#rawConfiguration) {
      this.#rawConfiguration = await CoreConfigFiles.tryLoadNodeServiceConfigurationFileAsync(
        taskSession.logger.terminal,
        heftConfiguration.buildFolderPath,
        heftConfiguration.rigConfig
      );

      // defaults
      this.#configuration = {
        commandName: 'serve',
        ignoreMissingScript: false,
        waitForTerminateMs: 2000,
        waitForKillMs: 2000
      };

      // TODO: @rushstack/heft-config-file should be able to read a *.defaults.json file
      if (this.#rawConfiguration) {
        this.#pluginEnabled = true;

        if (this.#rawConfiguration.commandName !== undefined) {
          this.#configuration.commandName = this.#rawConfiguration.commandName;
        }
        if (this.#rawConfiguration.ignoreMissingScript !== undefined) {
          this.#configuration.ignoreMissingScript = this.#rawConfiguration.ignoreMissingScript;
        }
        if (this.#rawConfiguration.waitForTerminateMs !== undefined) {
          this.#configuration.waitForTerminateMs = this.#rawConfiguration.waitForTerminateMs;
        }
        if (this.#rawConfiguration.waitForKillMs !== undefined) {
          this.#configuration.waitForKillMs = this.#rawConfiguration.waitForKillMs;
        }

        this.#shellCommand = (heftConfiguration.projectPackageJson.scripts || {})[
          this.#configuration.commandName
        ];

        if (this.#shellCommand === undefined) {
          if (this.#configuration.ignoreMissingScript) {
            taskSession.logger.terminal.writeLine(
              `The node service cannot be started because the project's package.json` +
                ` does not have a "${this.#configuration.commandName}" script`
            );
          } else {
            throw new Error(
              `The node service cannot be started because the project's package.json ` +
                `does not have a "${this.#configuration.commandName}" script`
            );
          }
          this.#pluginEnabled = false;
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
    if (!this.#pluginEnabled) {
      return;
    }

    this.#logger.terminal.writeLine(`Starting Node service...`);
    await this._stopChildAsync();
    this._startChild();
  }

  private async _stopChildAsync(): Promise<void> {
    if (this.#state !== State.Running) {
      if (this.#childProcessExitPromise) {
        // If we have an active process but are not in the running state, we must be in the process of
        // terminating or the process is already stopped.
        await this.#childProcessExitPromise;
      }
      return;
    }

    if (_isWindows) {
      // On Windows, SIGTERM can kill Cmd.exe and leave its children running in the background
      this._transitionToKilling();
    } else {
      if (!this.#activeChildProcess) {
        // All the code paths that set _activeChildProcess=undefined should also leave the Running state
        throw new InternalError('_activeChildProcess should not be undefined');
      }

      this.#state = State.Stopping;
      this.#logger.terminal.writeVerboseLine('Sending SIGTERM to gracefully shut down the service process');

      // Passing a negative PID terminates the entire group instead of just the one process.
      // This works because we set detached=true for child_process.spawn()

      const pid: number | undefined = this.#activeChildProcess.pid;
      if (pid !== undefined) {
        // If pid was undefined, the process failed to spawn
        process.kill(-pid, 'SIGTERM');
      }

      this._clearTimeout();
      this.#timeout = setTimeout(() => {
        try {
          if (this.#state !== State.Stopped) {
            this.#logger.terminal.writeWarningLine('The service process is taking too long to terminate');
            this._transitionToKilling();
          }
        } catch (e: unknown) {
          this.#childProcessExitPromiseRejectFn!(e);
        }
      }, this.#configuration.waitForTerminateMs);
    }

    await this.#childProcessExitPromise;
  }

  private _transitionToKilling(): void {
    this.#state = State.Killing;

    if (!this.#activeChildProcess) {
      // All the code paths that set _activeChildProcess=undefined should also leave the Running state
      throw new InternalError('_activeChildProcess should not be undefined');
    }

    this.#logger.terminal.writeVerboseLine('Attempting to killing the service process');

    SubprocessTerminator.killProcessTree(this.#activeChildProcess, SubprocessTerminator.RECOMMENDED_OPTIONS);

    this._clearTimeout();
    this.#timeout = setTimeout(() => {
      try {
        if (this.#state !== State.Stopped) {
          this.#logger.terminal.writeErrorLine(
            'Abandoning the service process because it could not be killed'
          );
          this._transitionToStopped();
        }
      } catch (e: unknown) {
        this.#childProcessExitPromiseRejectFn!(e);
      }
    }, this.#configuration.waitForKillMs);
  }

  private _transitionToStopped(): void {
    // Failed to start
    this.#state = State.Stopped;
    this._clearTimeout();
    this.#activeChildProcess = undefined;
    this.#childProcessExitPromiseResolveFn!();
  }

  private _startChild(): void {
    if (this.#state !== State.Stopped) {
      throw new InternalError('Invalid state');
    }

    this.#state = State.Running;
    this._clearTimeout();
    this.#logger.terminal.writeLine(`Invoking command: "${this.#shellCommand!}"`);

    const childProcess: child_process.ChildProcess = child_process.spawn(this.#shellCommand!, {
      shell: true,
      ...SubprocessTerminator.RECOMMENDED_OPTIONS
    });
    SubprocessTerminator.killProcessTreeOnExit(childProcess, SubprocessTerminator.RECOMMENDED_OPTIONS);

    const childPid: number | undefined = childProcess.pid;
    if (childPid === undefined) {
      throw new InternalError(`Failed to spawn child process`);
    }
    this.#logger.terminal.writeVerboseLine(`Started service process #${childPid}`);

    // Create a promise that resolves when the child process exits
    this.#childProcessExitPromise = new Promise<void>((resolve, reject) => {
      this.#childProcessExitPromiseResolveFn = resolve;
      this.#childProcessExitPromiseRejectFn = reject;

      childProcess.stdout?.on('data', (data: Buffer) => {
        this.#logger.terminal.write(data.toString());
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        this.#logger.terminal.writeError(data.toString());
      });

      childProcess.on('close', (exitCode: number | null, signal: NodeJS.Signals | null): void => {
        try {
          // The 'close' event is emitted after a process has ended and the stdio streams of a child process
          // have been closed. This is distinct from the 'exit' event, since multiple processes might share the
          // same stdio streams. The 'close' event will always emit after 'exit' was already emitted,
          // or 'error' if the child failed to spawn.

          if (this.#state === State.Running) {
            this.#logger.terminal.writeWarningLine(
              `The service process #${childPid} terminated unexpectedly` +
                this._formatCodeOrSignal(exitCode, signal)
            );
            this._transitionToStopped();
            return;
          }

          if (this.#state === State.Stopping || this.#state === State.Killing) {
            this.#logger.terminal.writeVerboseLine(
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
          this.#logger.terminal.writeVerboseLine(
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

          if (this.#state === State.Running) {
            this.#logger.terminal.writeErrorLine(`Failed to start: ` + err.toString());
            this._transitionToStopped();
            return;
          }

          if (this.#state === State.Stopping) {
            this.#logger.terminal.writeWarningLine(
              `The service process #${childPid} rejected the shutdown signal: ` + err.toString()
            );
            this._transitionToKilling();
            return;
          }

          if (this.#state === State.Killing) {
            this.#logger.terminal.writeErrorLine(
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

    this.#activeChildProcess = childProcess;
  }

  private _clearTimeout(): void {
    if (this.#timeout) {
      clearTimeout(this.#timeout);
      this.#timeout = undefined;
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
