// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { once } from 'node:events';

import type {
  IAfterExecuteEventMessage,
  IRequestRunEventMessage,
  ISyncEventMessage,
  IRunCommandMessage,
  IExitCommandMessage
} from '@rushstack/operation-graph';
import { TerminalProviderSeverity, type ITerminal, type ITerminalProvider } from '@rushstack/terminal';

import type { IPhase } from '../../api/CommandLineConfiguration';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { Utilities } from '../../utilities/Utilities';
import type { IOperationRunner, IOperationRunnerContext, IOperationLastState } from './IOperationRunner';
import { OperationError } from './OperationError';
import { OperationStatus } from './OperationStatus';

export interface IIPCOperationRunnerOptions {
  phase: IPhase;
  project: RushConfigurationProject;
  name: string;
  initialCommand: string;
  incrementalCommand: string | undefined;
  commandForHash: string;
  ignoredParameterValues: ReadonlyArray<string>;
  /**
   * Optional process factory for an explicit IPC executable. Receives the native lifecycle
   * environment, stdio and process-group options; the default preserves shell command execution.
   */
  spawn?: (command: string, args: ReadonlyArray<string>, options: SpawnOptions) => ChildProcess;
}

function isAfterExecuteEventMessage(message: unknown): message is IAfterExecuteEventMessage {
  return (
    !!message &&
    typeof message === 'object' &&
    (message as IAfterExecuteEventMessage).event === 'after-execute'
  );
}

function isRequestRunEventMessage(message: unknown): message is IRequestRunEventMessage {
  return (
    !!message && typeof message === 'object' && (message as IRequestRunEventMessage).event === 'requestRun'
  );
}

function isSyncEventMessage(message: unknown): message is ISyncEventMessage {
  return !!message && typeof message === 'object' && (message as ISyncEventMessage).event === 'sync';
}

/**
 * Runner that hosts a long-lived process to which it communicates via IPC.
 */
export class IPCOperationRunner implements IOperationRunner {
  public readonly name: string;
  public readonly cacheable: boolean = false;
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly warningsAreAllowed: boolean;

  private readonly _rushProject: RushConfigurationProject;
  private readonly _initialCommand: string;
  private readonly _incrementalCommand: string | undefined;
  private readonly _commandForHash: string;
  private readonly _ignoredParameterValues: ReadonlyArray<string>;
  private readonly _spawn: IIPCOperationRunnerOptions['spawn'];

  private _ipcProcess: ChildProcess | undefined;
  private _processReadyPromise: Promise<void> | undefined;
  private _processClosedPromise: Promise<void> | undefined;
  private _residentMemoryBytes: number | undefined;
  private _closing: boolean = false;

  public constructor(options: IIPCOperationRunnerOptions) {
    const {
      name,
      phase: { allowWarningsOnSuccess = false },
      project,
      initialCommand,
      incrementalCommand,
      commandForHash,
      ignoredParameterValues
    } = options;
    this.name = name;
    this.warningsAreAllowed =
      EnvironmentConfiguration.allowWarningsInSuccessfulBuild || allowWarningsOnSuccess;
    this._rushProject = project;
    this._initialCommand = initialCommand;
    this._incrementalCommand = incrementalCommand;
    this._commandForHash = commandForHash;

    this._ignoredParameterValues = ignoredParameterValues;
    this._spawn = options.spawn;
  }

  public get isActive(): boolean {
    return !!(this._ipcProcess && this._ipcProcess.exitCode === null && this._ipcProcess.signalCode === null);
  }

  public get residentMemoryBytes(): number | undefined {
    return this.isActive ? this._residentMemoryBytes : undefined;
  }

  public async executeAsync(
    context: IOperationRunnerContext,
    lastState?: IOperationLastState
  ): Promise<OperationStatus> {
    if (this._closing) {
      // A failed close may already have sent "exit". Never send new work to that retiring child.
      await this.closeAsync();
    }
    const commandToRun: string =
      lastState && this._incrementalCommand ? this._incrementalCommand : this._initialCommand;
    const invalidate: (reason: string) => void = context.getInvalidateCallback();
    return await context.runWithTerminalAsync(
      async (terminal: ITerminal, terminalProvider: ITerminalProvider): Promise<OperationStatus> => {
        let isConnected: boolean = false;
        if (!this._ipcProcess || !this.isActive) {
          await this._processClosedPromise;
          this._residentMemoryBytes = undefined;
          // Log any ignored parameters
          if (this._ignoredParameterValues.length > 0) {
            terminal.writeLine(
              `These parameters were ignored for this operation by project-level configuration: ${this._ignoredParameterValues.join(' ')}`
            );
          }

          // Run the operation
          terminal.writeLine('Invoking: ' + commandToRun);

          const { rushConfiguration, projectFolder } = this._rushProject;

          const { environment: initialEnvironment } = context;

          this._ipcProcess = Utilities.executeLifecycleCommandAsync(
            commandToRun,
            {
              rushConfiguration,
              workingDirectory: projectFolder,
              initCwd: rushConfiguration.commonTempFolder,
              handleOutput: true,
              environmentPathOptions: {
                includeProjectBin: true
              },
              ipc: true,
              connectSubprocessTerminator: true,
              initialEnvironment
            },
            this._spawn
          );
          this._processClosedPromise = new Promise((resolve) => this._ipcProcess!.once('close', resolve));

          let resolveReadyPromise!: () => void;

          this._processReadyPromise = new Promise<void>((resolve) => {
            resolveReadyPromise = resolve;
          });

          this._ipcProcess.on('message', (message: unknown) => {
            if (isRequestRunEventMessage(message)) {
              const reason: string = message.detail
                ? `${message.requestor}: ${message.detail}`
                : message.requestor;
              invalidate(reason);
            } else if (isSyncEventMessage(message)) {
              resolveReadyPromise();
            }
          });
        } else {
          terminal.writeLine(`Connecting to existing IPC process...`);
        }
        const subProcess: ChildProcess = this._ipcProcess;
        let hasWarningOrError: boolean = false;

        function onStdout(data: Buffer): void {
          const text: string = data.toString();
          terminalProvider.write(text, TerminalProviderSeverity.log);
        }
        function onStderr(data: Buffer): void {
          const text: string = data.toString();
          terminalProvider.write(text, TerminalProviderSeverity.error);
          hasWarningOrError = true;
        }

        // Hook into events, in order to get live streaming of the log
        subProcess.stdout?.on('data', onStdout);
        subProcess.stderr?.on('data', onStderr);

        const status: OperationStatus = await new Promise((resolve, reject) => {
          const finishHandler = (message: unknown): void => {
            if (isAfterExecuteEventMessage(message)) {
              const memory: number | undefined = message.residentMemoryBytes;
              this._residentMemoryBytes =
                typeof memory === 'number' && Number.isSafeInteger(memory) && memory > 0 ? memory : undefined;
              terminal.writeLine('Received finish notification');
              subProcess.stdout?.off('data', onStdout);
              subProcess.stderr?.off('data', onStderr);
              subProcess.off('message', finishHandler);
              subProcess.off('error', reject);
              subProcess.off('exit', onExit);
              terminal.writeLine('Disconnected from IPC process');
              // These types are currently distinct but have the same underlying values
              resolve(message.status as unknown as OperationStatus);
            }
          };

          function onExit(exitCode: number | null, signal: NodeJS.Signals | null): void {
            try {
              if (isConnected) {
                context.error = new OperationError(
                  'error',
                  'IPC process exited before reporting its operation result.'
                );
                resolve(OperationStatus.Failure);
              } else if (signal) {
                context.error = new OperationError('error', `Terminated by signal: ${signal}`);
                resolve(OperationStatus.Failure);
              } else if (exitCode !== 0) {
                // Do NOT reject here immediately, give a chance for other logic to suppress the error
                context.error = new OperationError('error', `Returned error code: ${exitCode}`);
                resolve(OperationStatus.Failure);
              } else if (hasWarningOrError) {
                resolve(OperationStatus.SuccessWithWarning);
              } else {
                resolve(OperationStatus.Success);
              }
            } catch (error) {
              reject(error as OperationError);
            }
          }

          subProcess.on('message', finishHandler);
          subProcess.on('error', reject);
          subProcess.on('exit', onExit);
          this._processReadyPromise!.then(() => {
            isConnected = true;
            terminal.writeLine('Child supports IPC protocol. Sending "run" command...');
            const runCommand: IRunCommandMessage = {
              command: 'run'
            };
            subProcess.send(runCommand);
          }, reject);
        });

        if (isConnected && !context.shouldRunnerPersist) {
          await this.closeAsync();
        }

        // @rushstack/operation-graph does not currently have a concept of "Success with Warning"
        // To match existing ShellOperationRunner behavior we treat any stderr as a warning.
        return status === OperationStatus.Success && hasWarningOrError
          ? OperationStatus.SuccessWithWarning
          : status;
      },
      {
        createLogFile: true
      }
    );
  }

  public getConfigHash(): string {
    return this._commandForHash;
  }

  public async closeAsync(): Promise<void> {
    const { _ipcProcess: subProcess } = this;
    if (!subProcess) {
      return;
    }

    this._closing = true;
    if (this.isActive) {
      if (!subProcess.connected) {
        throw new Error(`Cannot close the live IPC runner "${this.name}": its IPC channel is disconnected.`);
      }
      const closed: Promise<unknown> = once(subProcess, 'close');
      const exitCommand: IExitCommandMessage = {
        command: 'exit'
      };
      subProcess.send(exitCommand);
      await closed;
    }
    // Even after "exit", stdio/descendants can still be draining. Resource ownership ends at "close".
    await this._processClosedPromise;
    this._ipcProcess = undefined;
    this._processReadyPromise = undefined;
    this._processClosedPromise = undefined;
    this._residentMemoryBytes = undefined;
    this._closing = false;
  }
}
