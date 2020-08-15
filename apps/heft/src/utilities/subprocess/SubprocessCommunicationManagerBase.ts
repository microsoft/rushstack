// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';

import { ISubprocessMessageBase } from './SubprocessCommunication';

export type SendMessageFunctionType = (message: ISubprocessMessageBase) => void;

export interface ISubprocessCommunicationManagerBaseOptions {
  sendMessageToParentProcess: SendMessageFunctionType;
  sendMessageToSubprocess: SendMessageFunctionType;
}

export abstract class SubprocessCommunicationManagerBase {
  protected readonly _sendMessageToParentProcess: SendMessageFunctionType;
  protected _sendMessageToSubprocess: SendMessageFunctionType;

  public constructor(options: ISubprocessCommunicationManagerBaseOptions) {
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
