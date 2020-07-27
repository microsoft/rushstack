// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalProvider, TerminalProviderSeverity } from '@rushstack/node-core-library';

import { ISubprocessInnerConfiguration } from './SubprocessRunnerBase';
import { ISubprocessLoggingMessage } from './SubprocessCommunication';

export class SubprocessTerminalProvider implements ITerminalProvider {
  private _builderConfiguration: ISubprocessInnerConfiguration;

  public constructor(builderConfiguration: ISubprocessInnerConfiguration) {
    if (!process.send) {
      throw new Error(`The process.send function is not supported in this context`);
    }

    this._builderConfiguration = builderConfiguration;
  }

  public get supportsColor(): boolean {
    return this._builderConfiguration.terminalSupportsColor;
  }

  public get eolCharacter(): string {
    return this._builderConfiguration.terminalEolCharacter;
  }

  public write(data: string, severity: TerminalProviderSeverity): void {
    const message: ISubprocessLoggingMessage = {
      type: 'logging',
      data,
      severity
    };
    process.send!(message);
  }
}
