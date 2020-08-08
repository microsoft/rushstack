// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';
import * as path from 'path';
import { ITerminalProvider, TerminalProviderSeverity } from '@rushstack/node-core-library';

import {
  ISubprocessMessageBase,
  ISubprocessApiCallArg,
  SupportedSerializableArgType,
  ISubprocessApiCallArgWithValue,
  ISerializedErrorValue
} from './SubprocessCommunication';
import { IExtendedFileSystem } from '../fileSystem/IExtendedFileSystem';
import { CachedFileSystem } from '../fileSystem/CachedFileSystem';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { TerminalProviderManager } from './TerminalProviderManager';
import { SubprocessCommunicationManagerBase } from './SubprocessCommunicationManagerBase';

export interface ISubprocessInnerConfiguration {
  globalTerminalProviderId: number;
  terminalSupportsColor: boolean;
  terminalEolCharacter: string;
}

export const SUBPROCESS_RUNNER_CLASS_LABEL: unique symbol = Symbol('IsSubprocessModule');
export const SUBPROCESS_RUNNER_INNER_INVOKE: unique symbol = Symbol('SubprocessInnerInvoke');

interface ISubprocessExitMessage extends ISubprocessMessageBase {
  type: 'exit';
  error: ISubprocessApiCallArg;
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

  private _terminalProviderManager: TerminalProviderManager;

  private _innerConfiguration: ISubprocessInnerConfiguration;
  private _runningAsSubprocess: boolean = false;
  protected readonly _configuration: TSubprocessConfiguration;
  protected readonly _fileSystem: IExtendedFileSystem = new CachedFileSystem();

  protected _globalTerminalProvider: ITerminalProvider;
  private readonly _subprocessCommunicationManagers: SubprocessCommunicationManagerBase[] = [];

  /**
   * The subprocess filename. This should be set to __filename in the child class.
   */
  public abstract get filename(): string;

  /**
   * Constructs an instances of a subprocess runner
   */
  public constructor(
    parentGlobalTerminalProvider: ITerminalProvider,
    configuration: TSubprocessConfiguration,
    heftSession: HeftSession
  ) {
    this._configuration = configuration;

    if (parentGlobalTerminalProvider) {
      // This is the parent process
      this._terminalProviderManager = new TerminalProviderManager({
        sendMessageToParentProcessFn: this._receiveMessageFromSubprocess.bind(this),
        sendMessageToSubprocessFn: this._receiveMessageFromParentProcess.bind(this)
      });
      const globalTerminalProviderId: number = this._terminalProviderManager.registerTerminalProvider(
        parentGlobalTerminalProvider
      );
      this._innerConfiguration = {
        globalTerminalProviderId: globalTerminalProviderId,
        terminalEolCharacter: parentGlobalTerminalProvider.eolCharacter,
        terminalSupportsColor: parentGlobalTerminalProvider.supportsColor
      };
      this._globalTerminalProvider = this._terminalProviderManager.registerSubprocessTerminalProvider(
        globalTerminalProviderId,
        this._innerConfiguration
      );

      this._subprocessCommunicationManagers.push(this._terminalProviderManager);

      this.initialize();
    }
  }

  public static initializeSubprocess<TSubprocessConfiguration>(
    thisType: new (
      parentGlobalTerminalProvider: ITerminalProvider,
      configuration: TSubprocessConfiguration,
      heftSession: HeftSession
    ) => SubprocessRunnerBase<TSubprocessConfiguration>,
    innerConfiguration: ISubprocessInnerConfiguration,
    configuration: TSubprocessConfiguration
  ): SubprocessRunnerBase<TSubprocessConfiguration> {
    const subprocessRunner: SubprocessRunnerBase<TSubprocessConfiguration> = new thisType(
      undefined!,
      configuration,
      undefined!
    );
    subprocessRunner._runningAsSubprocess = true;
    subprocessRunner._innerConfiguration = innerConfiguration;
    subprocessRunner._terminalProviderManager = new TerminalProviderManager({
      sendMessageToParentProcessFn: process.send!.bind(process),
      sendMessageToSubprocessFn: () => {
        throw new Error('A subprocess cannot send a message to itself.');
      }
    });
    subprocessRunner._globalTerminalProvider = subprocessRunner._terminalProviderManager.registerSubprocessTerminalProvider(
      innerConfiguration.globalTerminalProviderId,
      innerConfiguration
    );

    subprocessRunner._subprocessCommunicationManagers.push(subprocessRunner._terminalProviderManager);
    subprocessRunner.initialize();

    return subprocessRunner;
  }

  public invokeAsSubprocessAsync(): Promise<void> {
    return new Promise((resolve: () => void, reject: (error: Error) => void) => {
      const builderProcess: childProcess.ChildProcess = childProcess.fork(
        path.resolve(__dirname, 'startSubprocess'),
        [this.filename, JSON.stringify(this._innerConfiguration), JSON.stringify(this._configuration)],
        {
          execArgv: this._processNodeArgsForSubprocess(this._globalTerminalProvider, process.execArgv)
        }
      );

      let hasExited: boolean = false;
      let exitError: Error | undefined;

      builderProcess.on('message', (message: ISubprocessMessageBase) => {
        switch (message.type) {
          case 'exit': {
            if (hasExited) {
              throw new Error(
                `Subprocess communication error. Received a duplicate "${message.type}" message.`
              );
            }

            const exitMessage: ISubprocessExitMessage = message as ISubprocessExitMessage;
            hasExited = true;
            exitError = this._deserializeArg(exitMessage.error) as Error | undefined;

            break;
          }

          default: {
            if (hasExited) {
              throw new Error(
                'Subprocess communication error. Received a message after the subprocess ' +
                  'has indicated that it has exited'
              );
            }

            this._receiveMessageFromSubprocess(message);
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

  public abstract invokeAsync(): Promise<void>;

  public async [SUBPROCESS_RUNNER_INNER_INVOKE](): Promise<void> {
    process.on('message', (message: ISubprocessMessageBase) => {
      this._receiveMessageFromParentProcess(message);
    });

    let error: Error | undefined = undefined;
    try {
      await this.invokeAsync();
    } catch (e) {
      error = e;
    } finally {
      process.removeAllListeners();

      const exitMessage: ISubprocessExitMessage = {
        type: 'exit',
        error: this._serializeArg(error)
      };
      process.send!(exitMessage);
    }
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

  private _receiveMessageFromParentProcess(message: ISubprocessMessageBase): void {
    for (const subprocessCommunicationManager of this._subprocessCommunicationManagers) {
      if (subprocessCommunicationManager.canHandleMessageFromParentProcess(message)) {
        subprocessCommunicationManager.receiveMessageFromParentProcess(message);
        break;
      }
    }

    throw new Error(
      'Subprocess communication manager. No communication manager can handle message type ' +
        `"${message.type}" from parent process.`
    );
  }

  private _receiveMessageFromSubprocess(message: ISubprocessMessageBase): void {
    for (const subprocessCommunicationManager of this._subprocessCommunicationManagers) {
      if (subprocessCommunicationManager.canHandleMessageFromSubprocess(message)) {
        subprocessCommunicationManager.receiveMessageFromSubprocess(message);
        return;
      }
    }

    throw new Error(
      'Subprocess communication manager. No communication manager can handle message type ' +
        `"${message.type}" from subprocess.`
    );
  }

  private _serializeArg(arg: unknown): ISubprocessApiCallArg {
    if (arg === undefined) {
      return { type: SupportedSerializableArgType.Undefined };
    } else if (arg === null) {
      return { type: SupportedSerializableArgType.Null };
    }

    switch (typeof arg) {
      case 'object': {
        if (arg instanceof Error) {
          const result: ISubprocessApiCallArgWithValue<ISerializedErrorValue> = {
            type: SupportedSerializableArgType.Error,
            value: {
              errorMessage: arg.message,
              errorStack: arg.stack
            }
          };

          return result;
        }

        break;
      }

      case 'string':
      case 'number':
      case 'boolean': {
        const result: ISubprocessApiCallArgWithValue = {
          type: SupportedSerializableArgType.Primitive,
          value: arg
        };

        return result;
      }
    }

    throw new Error(`Argument (${arg}) is not supported in subprocess communication.`);
  }

  private _deserializeArg(arg: ISubprocessApiCallArg): unknown | undefined {
    switch (arg.type) {
      case SupportedSerializableArgType.Undefined: {
        return undefined;
      }

      case SupportedSerializableArgType.Null: {
        // eslint-disable-next-line @rushstack/no-null
        return null;
      }

      case SupportedSerializableArgType.Error: {
        const typedArg: ISubprocessApiCallArgWithValue<ISerializedErrorValue> = arg as ISubprocessApiCallArgWithValue<
          ISerializedErrorValue
        >;
        const result: Error = new Error(typedArg.value.errorMessage);
        result.stack = typedArg.value.errorStack;
        return result;
      }

      case SupportedSerializableArgType.Primitive: {
        const typedArg: ISubprocessApiCallArgWithValue = arg as ISubprocessApiCallArgWithValue;
        return typedArg.value;
      }

      default:
        throw new Error(`Unexpected arg type "${arg.type}".`);
    }
  }
}
