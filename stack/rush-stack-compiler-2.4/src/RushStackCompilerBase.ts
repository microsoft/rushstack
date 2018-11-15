// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StandardBuildFolders } from './StandardBuildFolders';
import { ITerminalProvider, Terminal } from '@microsoft/node-core-library';

/**
 * @beta
 */
export abstract class RushStackCompilerBase<TOptions = {}> {
  protected _standardBuildFolders: StandardBuildFolders;
  protected _terminal: Terminal;
  protected _taskOptions: TOptions;

  constructor(taskOptions: TOptions, rootPath: string, terminalProvider: ITerminalProvider) {
    this._taskOptions = taskOptions;
    this._standardBuildFolders = new StandardBuildFolders(rootPath);
    this._terminal = new Terminal(terminalProvider);
  }
}
