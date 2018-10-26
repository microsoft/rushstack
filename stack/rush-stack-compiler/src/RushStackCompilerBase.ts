// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Constants } from './Constants';
import { ITerminalProvider, Terminal } from '@microsoft/node-core-library';

export abstract class RushStackCompilerBase<TOptions> {
  protected _constants: Constants;
  protected _terminal: Terminal;
  protected _taskOptions: TOptions;

  constructor(taskOptions: TOptions, constants: Constants, terminalProvider: ITerminalProvider) {
    this._taskOptions = taskOptions;
    this._constants = constants;
    this._terminal = new Terminal(terminalProvider);
  }
}
