// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as process from 'process';
import { performance } from 'perf_hooks';
import { InternalError } from '@rushstack/node-core-library';

import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IBuildStageContext, ICompileSubstage, IPostBuildSubstage } from '../stages/BuildStage';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { CoreConfigFiles } from '../utilities/CoreConfigFiles';
import { SubprocessTerminator } from '../utilities/subprocess/SubprocessTerminator';

const PLUGIN_NAME: string = 'NodeServicePlugin';

export interface INodeServicePluginCompleteConfiguration {
  commandName: string;
  ignoreMissingScript: boolean;
  waitBeforeRestartMs: number;
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

export class NodeServicePlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  private static readonly _isWindows: boolean = process.platform === 'win32';

  private _logger!: ScopedLogger;

  private _activeChildProcess: child_process.ChildProcess | undefined;

  private _state: State = State.Stopped;

  /**
   * The state machine schedules at most one setInterval() timeout at any given time.  It is for:
   *
   * - waitBeforeRestartMs in State.Stopped
   * - waitForTerminateMs in State.Stopping
   * - waitForKillMs in State.Killing
   */
  private _timeout: NodeJS.Timeout | undefined = undefined;

  /**
   * Used by _scheduleRestart().  The process will be automatically restarted when performance.now()
   * exceeds this time.
   */
  private _restartTime: number | undefined = undefined;

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

  /**
   * This is set to true when the child process terminates unexpectedly (for example, something like
   * "the service listening port is already in use" or "unable to authenticate to the database").
   * Rather than attempting to restart in a potentially endless loop, instead we will wait until "watch mode"
   * recompiles the project.
   */
  private _childProcessFailed: boolean = false;

  private _pluginEnabled: boolean = false;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    this._logger = heftSession.requestScopedLogger('node-service');

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      if (!build.properties.serveMode) {
        // This plugin is only used with "heft start"
        return;
      }

      build.hooks.loadStageConfiguration.tapPromise(PLUGIN_NAME, async () => {
        await this._loadStageConfiguration(heftConfiguration);

        if (this._pluginEnabled) {
          build.hooks.postBuild.tap(PLUGIN_NAME, (bundle: IPostBuildSubstage) => {
            bundle.hooks.run.tapPromise(PLUGIN_NAME, async () => {
              await this._runCommandAsync(heftSession, heftConfiguration);
            });
          });

          build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
            compile.hooks.afterEachIteration.tap(PLUGIN_NAME, this._compileHooks_afterEachIteration);
          });
        }
      });
    });
  }

  private async _loadStageConfiguration(heftConfiguration: HeftConfiguration): Promise<void> {
    this._rawConfiguration =
      await CoreConfigFiles.nodeServiceConfigurationLoader.tryLoadConfigurationFileForProjectAsync(
        this._logger.terminal,
        heftConfiguration.buildFolder,
        heftConfiguration.rigConfig
      );

    // defaults
    this._configuration = {
      commandName: 'serve',
      ignoreMissingScript: false,
      waitBeforeRestartMs: 2000,
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
      if (this._rawConfiguration.waitBeforeRestartMs !== undefined) {
        this._configuration.waitBeforeRestartMs = this._rawConfiguration.waitBeforeRestartMs;
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
          this._logger.terminal.writeLine(
            `The plugin is disabled because the project's package.json` +
              ` does not have a "${this._configuration.commandName}" script`
          );
        } else {
          throw new Error(
            `The node-service task cannot start because the project's package.json ` +
              `does not have a "${this._configuration.commandName}" script`
          );
        }
        this._pluginEnabled = false;
      }
    } else {
      this._logger.terminal.writeVerboseLine(
        'The plugin is disabled because its config file was not found: ' +
          CoreConfigFiles.nodeServiceConfigurationLoader.projectRelativeFilePath
      );
    }
  }

  private async _runCommandAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    this._logger.terminal.writeLine(`Starting Node service...`);

    this._restartChild();
  }

  private _compileHooks_afterEachIteration = (): void => {
    this._trapUnhandledException(() => {
      // We've recompiled, so try launching again
      this._childProcessFailed = false;

      if (this._state === State.Stopped) {
        // If we are already stopped, then extend the timeout
        this._scheduleRestart(this._configuration.waitBeforeRestartMs);
      } else {
        this._stopChild();
      }
    });
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
      stdio: ['inherit', 'inherit', 'inherit'],
      ...SubprocessTerminator.RECOMMENDED_OPTIONS
    });
    SubprocessTerminator.killProcessTreeOnExit(
      this._activeChildProcess,
      SubprocessTerminator.RECOMMENDED_OPTIONS
    );

    const childPid: number = this._activeChildProcess.pid;
    this._logger.terminal.writeVerboseLine(`Started service process #${childPid}`);

    this._activeChildProcess.on('close', (code: number, signal: string): void => {
      this._trapUnhandledException(() => {
        // The 'close' event is emitted after a process has ended and the stdio streams of a child process
        // have been closed. This is distinct from the 'exit' event, since multiple processes might share the
        // same stdio streams. The 'close' event will always emit after 'exit' was already emitted,
        // or 'error' if the child failed to spawn.

        if (this._state === State.Running) {
          this._logger.terminal.writeWarningLine(
            `The service process #${childPid} terminated unexpectedly` +
              this._formatCodeOrSignal(code, signal)
          );
          this._childProcessFailed = true;
          this._transitionToStopped();
          return;
        }

        if (this._state === State.Stopping || this._state === State.Killing) {
          this._logger.terminal.writeVerboseLine(
            `The service process #${childPid} terminated successfully` +
              this._formatCodeOrSignal(code, signal)
          );
          this._transitionToStopped();
          return;
        }
      });
    });

    // This is event only fires for Node.js >= 15.x
    this._activeChildProcess.on('spawn', () => {
      this._trapUnhandledException(() => {
        // Print a newline to separate the service's STDOUT from Heft's output
        console.log();
      });
    });

    this._activeChildProcess.on('exit', (code: number | null, signal: string | null) => {
      this._trapUnhandledException(() => {
        this._logger.terminal.writeVerboseLine(
          `The service process fired its "exit" event` + this._formatCodeOrSignal(code, signal)
        );
      });
    });

    this._activeChildProcess.on('error', (err: Error) => {
      this._trapUnhandledException(() => {
        // "The 'error' event is emitted whenever:
        // 1. The process could not be spawned, or
        // 2. The process could not be killed, or
        // 3. Sending a message to the child process failed.
        //
        // The 'exit' event may or may not fire after an error has occurred. When listening to both the 'exit'
        // and 'error' events, guard against accidentally invoking handler functions multiple times."

        if (this._state === State.Running) {
          this._logger.terminal.writeErrorLine(`Failed to start: ` + err.toString());
          this._childProcessFailed = true;
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
      });
    });
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

  private _stopChild(): void {
    if (this._state !== State.Running) {
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
      this._clearTimeout();

      this._logger.terminal.writeVerboseLine('Sending SIGTERM to gracefully shut down the service process');

      // Passing a negative PID terminates the entire group instead of just the one process.
      // This works because we set detached=true for child_process.spawn()
      process.kill(-this._activeChildProcess.pid, 'SIGTERM');

      this._clearTimeout();
      this._timeout = setTimeout(() => {
        this._timeout = undefined;
        this._logger.terminal.writeWarningLine('The service process is taking too long to terminate');
        this._transitionToKilling();
      }, this._configuration.waitForTerminateMs);
    }
  }

  private _transitionToKilling(): void {
    this._state = State.Killing;
    this._clearTimeout();

    if (!this._activeChildProcess) {
      // All the code paths that set _activeChildProcess=undefined should also leave the Running state
      throw new InternalError('_activeChildProcess should not be undefined');
    }

    this._logger.terminal.writeVerboseLine('Attempting to killing the service process');

    SubprocessTerminator.killProcessTree(this._activeChildProcess, SubprocessTerminator.RECOMMENDED_OPTIONS);

    this._clearTimeout();
    this._timeout = setTimeout(() => {
      this._timeout = undefined;
      this._logger.terminal.writeErrorLine('Abandoning the service process because it could not be killed');
      this._transitionToStopped();
    }, this._configuration.waitForKillMs);
  }

  private _transitionToStopped(): void {
    // Failed to start
    this._state = State.Stopped;
    this._clearTimeout();

    this._activeChildProcess = undefined;

    // Once we have stopped, schedule a restart
    if (!this._childProcessFailed) {
      this._scheduleRestart(this._configuration.waitBeforeRestartMs);
    } else {
      this._logger.terminal.writeLine(
        'The service process has failed.  Waiting for watch mode to recompile before restarting...'
      );
    }
  }

  private _scheduleRestart(msFromNow: number): void {
    const newTime: number = performance.now() + msFromNow;
    if (this._restartTime !== undefined && newTime < this._restartTime) {
      return;
    }

    this._restartTime = newTime;
    this._logger.terminal.writeVerboseLine(`Sleeping for ${msFromNow} milliseconds`);

    this._clearTimeout();
    this._timeout = setTimeout(() => {
      this._timeout = undefined;
      this._restartTime = undefined;

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

  private _trapUnhandledException(action: () => void): void {
    try {
      action();
    } catch (error) {
      this._logger.emitError(error);
      this._logger.terminal.writeErrorLine('An unexpected error occurred');

      // TODO: Provide a Heft facility for this
      process.exit(1);
    }
  }
}
