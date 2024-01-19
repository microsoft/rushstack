// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';

import {
  TerminalProviderSeverity,
  type ITerminal,
  type ITerminalProvider,
  SubprocessTerminator
} from '@rushstack/node-core-library';
import type { IPhase } from '../../api/CommandLineConfiguration';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { Utilities } from '../../utilities/Utilities';
import type { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';
import { OperationError } from './OperationError';
import { OperationStatus } from './OperationStatus';

export interface IIPCOperationRunnerOptions {
  phase: IPhase;
  project: RushConfigurationProject;
  name: string;
  shellCommand: string;
  warningsAreAllowed: boolean;
  persist: boolean;
}

interface IFinishedMessage {
  type: 'finished';
  status: OperationStatus;
}

interface IReadyMessage {
  type: 'ready';
}

interface IRequestRunMessage {
  type: 'requestRun';
  requestor?: string;
}

function isFinishedMessage(message: unknown): message is IFinishedMessage {
  return typeof message === 'object' && (message as IFinishedMessage).type === 'finished';
}

function isRequestRunMessage(message: unknown): message is IRequestRunMessage {
  return typeof message === 'object' && (message as IRequestRunMessage).type === 'requestRun';
}

function isReadyMessage(message: unknown): message is IReadyMessage {
  return typeof message === 'object' && (message as IReadyMessage).type === 'ready';
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

  private readonly _rushConfiguration: RushConfiguration;
  private readonly _shellCommand: string;
  private readonly _workingDirectory: string;
  private readonly _persist: boolean;

  private _ipcProcess: ChildProcess | undefined;
  private _processReadyPromise: Promise<void> | undefined;

  public constructor(options: IIPCOperationRunnerOptions) {
    this.name = options.name;
    this._rushConfiguration = options.project.rushConfiguration;
    this._shellCommand = options.shellCommand;
    this._workingDirectory = options.project.projectFolder;
    this._persist = options.persist;
    this.warningsAreAllowed = options.warningsAreAllowed;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    return await context.withTerminalAsync(
      async (terminal: ITerminal, terminalProvider: ITerminalProvider): Promise<OperationStatus> => {
        let isConnected: boolean = false;
        if (!this._ipcProcess || typeof this._ipcProcess.exitCode === 'number') {
          // Run the operation
          terminal.writeLine('Invoking: ' + this._shellCommand);

          this._ipcProcess = Utilities.executeLifecycleCommandAsync(this._shellCommand, {
            rushConfiguration: this._rushConfiguration,
            workingDirectory: this._workingDirectory,
            initCwd: this._rushConfiguration.commonTempFolder,
            handleOutput: true,
            environmentPathOptions: {
              includeProjectBin: true
            },
            ipc: true
          });

          // Ensure that Rush doesn't outlive its children
          SubprocessTerminator.killProcessTreeOnExit(this._ipcProcess, {
            detached: false
          });

          let resolveReadyPromise!: () => void;

          this._processReadyPromise = new Promise<void>((resolve) => {
            resolveReadyPromise = resolve;
          });

          this._ipcProcess.on('message', (message: unknown) => {
            if (isRequestRunMessage(message)) {
              // TODO: Handle run requests
            } else if (isReadyMessage(message)) {
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
          function finishHandler(message: unknown): void {
            if (isFinishedMessage(message)) {
              terminal.writeLine('Received finish notification');
              subProcess.stdout?.off('data', onStdout);
              subProcess.stderr?.off('data', onStderr);
              subProcess.off('message', finishHandler);
              subProcess.off('error', reject);
              subProcess.off('exit', onExit);
              terminal.writeLine('Disconnected from IPC process');
              resolve(message.status);
            }
          }

          function onExit(code: number): void {
            try {
              if (code !== 0) {
                // Do NOT reject here immediately, give a chance for other logic to suppress the error
                context.error = new OperationError('error', `Returned error code: ${code}`);
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
            subProcess.send('run');
          }, reject);
        });

        if (isConnected && !this._persist && typeof subProcess.exitCode !== 'number') {
          subProcess.send('exit');
          await once(subProcess, 'exit');
        }

        return status === OperationStatus.Success && hasWarningOrError
          ? OperationStatus.SuccessWithWarning
          : status;
      },
      true
    );
  }

  public getConfigHash(): string {
    return this._shellCommand;
  }
}
