// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StandardBuildFolders } from './StandardBuildFolders';
import { ITerminalProvider, Terminal } from '@microsoft/node-core-library';

/**
 * @public
 */
export type WriteFileIssueFunction = (
  filePath: string,
  line: number,
  column: number,
  errorCode: string,
  message: string
) => void;

/**
 * @public
 */
export interface IRushStackCompilerBaseOptions {
  fileError: WriteFileIssueFunction;
  fileWarning: WriteFileIssueFunction;
}

/**
 * @beta
 */
export abstract class RushStackCompilerBase<
  TOptions extends IRushStackCompilerBaseOptions = IRushStackCompilerBaseOptions
> {
  protected _standardBuildFolders: StandardBuildFolders;
  protected _terminal: Terminal;
  protected _taskOptions: TOptions;
  protected _fileError: WriteFileIssueFunction;
  protected _fileWarning: WriteFileIssueFunction;

  constructor(taskOptions: TOptions, rootPath: string, terminalProvider: ITerminalProvider) {
    this._taskOptions = taskOptions;
    this._standardBuildFolders = new StandardBuildFolders(rootPath);
    this._terminal = new Terminal(terminalProvider);
    this._fileError = taskOptions.fileError;
    this._fileWarning = taskOptions.fileWarning;
  }
}
