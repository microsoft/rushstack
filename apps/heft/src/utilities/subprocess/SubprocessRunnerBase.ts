// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';
import * as path from 'path';
import { ITerminalProvider, TerminalProviderSeverity } from '@rushstack/node-core-library';

import {
  IBaseSubprocessMessage as ISubprocessMessage,
  ISubprocessLoggingMessage
} from './SubprocessCommunication';
import { IExtendedFileSystem } from '../fileSystem/IExtendedFileSystem';
import { CachedFileSystem } from '../fileSystem/CachedFileSystem';

export interface ISubprocessInnerConfiguration {
  terminalSupportsColor: boolean;
  terminalEolCharacter: string;
}

export const SUBPROCESS_RUNNER_CLASS_LABEL: unique symbol = Symbol('IsSubprocessModule');
export const SUBPROCESS_RUNNER_INNER_INVOKE: unique symbol = Symbol('SubprocessInnerInvoke');

interface ISubprocessExitMessage extends ISubprocessMessage {
  type: 'exit';
  errorMessage?: string;
  errorStack?: string;
}

/**
 * This base class allows an computationally expensive task to be run in a separate NodeJS
 * process.
 *
 * The subprocess can be provided with a configuration, which must be JSON-serializable,
 * and the subprocess can log data via a Terminal object.
 */
export abstract class SubprocessRunnerBase<TSubprocessConfiguration> {
  public static [SUBPROCESS_RUNNER_CLASS_LABEL]: boolean = true;
  private static _subprocessInspectorPort: number = 9229 + 1; // 9229 is the default port

  protected _configuration: TSubprocessConfiguration;
  protected _fileSystem: IExtendedFileSystem = new CachedFileSystem();
  private _terminalProvider: ITerminalProvider;

  /**
   * The subprocess filename. This should be set to __filename in the child class.
   */
  public abstract get filename(): string;

  public constructor(terminalProvider: ITerminalProvider, configuration: TSubprocessConfiguration) {
    this._terminalProvider = terminalProvider;
    this._configuration = configuration;

    this.initializeTerminal(terminalProvider);
    this.initialize();
  }

  public invokeAsSubprocessAsync(): Promise<void> {
    return new Promise((resolve: () => void, reject: (error: Error) => void) => {
      const innerConfiguration: ISubprocessInnerConfiguration = {
        terminalSupportsColor: this._terminalProvider.supportsColor,
        terminalEolCharacter: this._terminalProvider.eolCharacter
      };

      const builderProcess: childProcess.ChildProcess = childProcess.fork(
        path.resolve(__dirname, 'startSubprocess'),
        [this.filename, JSON.stringify(innerConfiguration), JSON.stringify(this._configuration)],
        {
          execArgv: this._processNodeArgsForSubprocess(this._terminalProvider, process.execArgv)
        }
      );

      let hasExited: boolean = false;
      let exitError: Error | undefined;

      builderProcess.on('message', (message: ISubprocessMessage) => {
        switch (message.type) {
          case 'logging': {
            const loggingMessage: ISubprocessLoggingMessage = message as ISubprocessLoggingMessage;
            this._terminalProvider.write(loggingMessage.data, loggingMessage.severity);
            break;
          }

          case 'exit': {
            if (hasExited) {
              throw new Error(
                `Subprocess communication error. Received a duplicate "${message.type}" message.`
              );
            }

            const exitMessage: ISubprocessExitMessage = message as ISubprocessExitMessage;
            hasExited = true;
            if (exitMessage.errorMessage) {
              exitError = new Error(exitMessage.errorMessage);
              exitError.stack = exitMessage.errorStack;
            }

            break;
          }

          default: {
            throw new Error(`Subprocess communication error. Unexpected message type: "${message.type}"`);
          }
        }
      });

      builderProcess.on('close', () => {
        if (exitError) {
          reject(exitError);
        } else if (!hasExited) {
          reject(new Error('Subprocess exited before sending "exit" message.'));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * @virtual
   */
  public initialize(): void {
    /* virtual */
  }

  /**
   * @virtual
   */
  public initializeTerminal(terminalProvider: ITerminalProvider): void {
    /* virtual */
  }

  public abstract async invokeAsync(): Promise<void>;

  public async [SUBPROCESS_RUNNER_INNER_INVOKE](): Promise<void> {
    let exitMessage: ISubprocessExitMessage;
    try {
      await this.invokeAsync();
      exitMessage = {
        type: 'exit'
      };
    } catch (error) {
      exitMessage = {
        type: 'exit',
        errorMessage: error.message || error,
        errorStack: error.stack
      };
    }

    process.send!(exitMessage);
  }

  private _processNodeArgsForSubprocess(terminalProvider: ITerminalProvider, nodeArgs: string[]): string[] {
    nodeArgs = [...nodeArgs]; // Clone the args array
    const inspectPort: number = SubprocessRunnerBase._subprocessInspectorPort++;
    let willUseInspector: boolean = false;

    for (let i: number = 0; i < nodeArgs.length; i++) {
      // The '--inspect' and '--inspect-brk' arguments can have an explicit port specified with syntax that
      // looks like '--inspect=<port>', so we'll split by the '=' character in case the port is explicitly specified
      const [firstNodeArgPart]: string[] = nodeArgs[i].split('=');
      if (firstNodeArgPart === '--inspect' || firstNodeArgPart === '--inspect-brk') {
        nodeArgs[i] = `${firstNodeArgPart}=${inspectPort}`;
        willUseInspector = true;
      }
    }

    if (willUseInspector) {
      // Don't bother instantiating a Terminal object just for this one logging statement.
      terminalProvider.write(
        `Subprocess with inspector bound to port ${inspectPort}${terminalProvider.eolCharacter}`,
        TerminalProviderSeverity.log
      );
    }

    return nodeArgs;
  }
}
