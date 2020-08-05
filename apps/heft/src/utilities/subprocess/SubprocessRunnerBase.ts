// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';
import * as path from 'path';
import { ITerminalProvider, TerminalProviderSeverity } from '@rushstack/node-core-library';

import {
  IBaseSubprocessMessage as ISubprocessMessage,
  IApiCallMessage,
  ISubprocessApiCallArg,
  SupportedSerializableArgType,
  ISerializedErrorValue,
  ISubprocessApiCallArgWithValue
} from './SubprocessCommunication';
import { IExtendedFileSystem } from '../fileSystem/IExtendedFileSystem';
import { CachedFileSystem } from '../fileSystem/CachedFileSystem';
import { SubprocessTerminalProvider } from './SubprocessTerminalProvider';

export interface ISubprocessInnerConfiguration {
  terminalSupportsColor: boolean;
  terminalEolCharacter: string;
}

export const SUBPROCESS_RUNNER_CLASS_LABEL: unique symbol = Symbol('IsSubprocessModule');
export const SUBPROCESS_RUNNER_INNER_INVOKE: unique symbol = Symbol('SubprocessInnerInvoke');

interface ISubprocessExitMessage extends ISubprocessMessage {
  type: 'exit';
  error: ISubprocessApiCallArg;
}

let apiCallIdCounter: number = 0;

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

  private _runningAsSubprocess: boolean = false;
  private readonly _parentGlobalTerminalProvider: ITerminalProvider;
  protected readonly _configuration: TSubprocessConfiguration;
  protected readonly _fileSystem: IExtendedFileSystem = new CachedFileSystem();

  protected readonly _globalTerminalProvider: ITerminalProvider;

  /**
   * The subprocess filename. This should be set to __filename in the child class.
   */
  public abstract get filename(): string;

  public constructor(
    innerConfiguration: ISubprocessInnerConfiguration,
    configuration: TSubprocessConfiguration
  );
  public constructor(
    parentGlobalTerminalProvider: ITerminalProvider,
    configuration: TSubprocessConfiguration
  );
  public constructor(
    innerConfigurationOrTerminalProvider: ITerminalProvider | ISubprocessInnerConfiguration,
    configuration: TSubprocessConfiguration
  ) {
    let innerConfiguration:
      | ISubprocessInnerConfiguration
      | undefined = innerConfigurationOrTerminalProvider as ISubprocessInnerConfiguration;
    let parentGlobalTerminalProvider: ITerminalProvider | undefined = undefined;
    if (
      innerConfiguration.terminalEolCharacter === undefined ||
      innerConfiguration.terminalSupportsColor === undefined
    ) {
      // This is the non-subprocess-invocation case
      parentGlobalTerminalProvider = innerConfigurationOrTerminalProvider as ITerminalProvider;
      innerConfiguration = undefined;
    }

    if (innerConfiguration) {
      this._globalTerminalProvider = new SubprocessTerminalProvider(
        innerConfiguration,
        this._sendGlobalTerminalProviderMessage.bind(this)
      );
    } else {
      this._parentGlobalTerminalProvider = parentGlobalTerminalProvider!;
      this._globalTerminalProvider = parentGlobalTerminalProvider!;
    }

    this._configuration = configuration;

    this.initialize();
  }

  public invokeAsSubprocessAsync(): Promise<void> {
    this._runningAsSubprocess = true;

    return new Promise((resolve: () => void, reject: (error: Error) => void) => {
      const innerConfiguration: ISubprocessInnerConfiguration = {
        terminalSupportsColor: this._globalTerminalProvider.supportsColor,
        terminalEolCharacter: this._globalTerminalProvider.eolCharacter
      };

      const builderProcess: childProcess.ChildProcess = childProcess.fork(
        path.resolve(__dirname, 'startSubprocess'),
        [this.filename, JSON.stringify(innerConfiguration), JSON.stringify(this._configuration)],
        {
          execArgv: this._processNodeArgsForSubprocess(this._globalTerminalProvider, process.execArgv)
        }
      );

      let hasExited: boolean = false;
      let exitError: Error | undefined;

      builderProcess.on('message', (message: ISubprocessMessage) => {
        switch (message.type) {
          case 'subprocessApiCall': {
            const apiCallMessage: IApiCallMessage = message as IApiCallMessage;
            this._receiveApiMessage(apiCallMessage);
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
            exitError = this._deserializeArg(exitMessage.error) as Error | undefined;

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

  public abstract async invokeAsync(): Promise<void>;

  public async [SUBPROCESS_RUNNER_INNER_INVOKE](): Promise<void> {
    this._runningAsSubprocess = true;
    let error: Error | undefined = undefined;
    try {
      await this.invokeAsync();
    } catch (e) {
      error = e;
    } finally {
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

  private _sendGlobalTerminalProviderMessage(message: string, severity: TerminalProviderSeverity): void {
    this._sendSubprocessApiMessage(this._receiveGlobalTerminalProviderMessage.name, arguments);
  }

  private _receiveGlobalTerminalProviderMessage(message: string, severity: TerminalProviderSeverity): void {
    this._parentGlobalTerminalProvider.write(message, severity);
  }

  private _sendSubprocessApiMessage(apiName: string, args: IArguments): void {
    const message: IApiCallMessage = {
      type: 'subprocessApiCall',
      id: apiCallIdCounter++,
      apiName,
      args: Array.from(args).map((arg) => this._serializeArg(arg)),
      expectsResponse: false
    };

    if (this._runningAsSubprocess) {
      process.send!(message);
    } else {
      this._receiveApiMessage(message);
    }
  }

  private _receiveApiMessage(message: IApiCallMessage): void {
    const args: unknown[] = message.args.map((arg) => this._deserializeArg(arg));

    if (typeof this[message.apiName] === 'function') {
      this[message.apiName].call(this, ...args);
    } else {
      throw new Error(`Unknown API ${message.apiName}`);
    }
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
        } else {
          throw new Error(`Object argument (${arg}) is not supported in subprocess communication.`);
        }
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
