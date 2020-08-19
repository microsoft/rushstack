// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';

import { ISubprocessMessageBase } from './SubprocessCommunication';

export type SendMessageFunctionType = (message: ISubprocessMessageBase) => void;

export interface ISubprocessCommunicationManagerInitializationOptions {
  sendMessageToParentProcess: SendMessageFunctionType;
  sendMessageToSubprocess: SendMessageFunctionType;
}

export abstract class SubprocessCommunicationManagerBase {
  private _sendMessageToParentProcess: SendMessageFunctionType;
  private _sendMessageToSubprocess: SendMessageFunctionType;

  protected get sendMessageToParentProcess(): SendMessageFunctionType {
    return this._sendMessageToParentProcess;
  }

  protected get sendMessageToSubprocess(): SendMessageFunctionType {
    return this._sendMessageToSubprocess;
  }

  public initialize(options: ISubprocessCommunicationManagerInitializationOptions): void {
    this._sendMessageToParentProcess = options.sendMessageToParentProcess;
    this._sendMessageToSubprocess = options.sendMessageToSubprocess;
  }

  public registerSubprocess(subprocess: childProcess.ChildProcess): void {
    this._sendMessageToSubprocess = subprocess.send.bind(subprocess);
  }

  public abstract canHandleMessageFromSubprocess(message: ISubprocessMessageBase): boolean;
  public abstract receiveMessageFromSubprocess(message: ISubprocessMessageBase): void;

  public abstract canHandleMessageFromParentProcess(message: ISubprocessMessageBase): boolean;
  public abstract receiveMessageFromParentProcess(message: ISubprocessMessageBase): void;
}
