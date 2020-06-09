// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal, ITerminalProvider } from '@rushstack/node-core-library';
import { WriteFileIssueFunction, IRushStackCompilerBaseOptions } from './RushStackCompilerBase';

export class LoggingUtilities {
  private _terminal: Terminal;

  public constructor(terminal: ITerminalProvider) {
    this._terminal = new Terminal(terminal);
  }

  public getDefaultRushStackCompilerBaseOptions(): IRushStackCompilerBaseOptions {
    return {
      fileError: this.fileError,
      fileWarning: this.fileWarning,
    };
  }

  public fileError: WriteFileIssueFunction = (
    filePath: string,
    line: number,
    column: number,
    errorCode: string,
    message: string
  ): void => {
    this._terminal.writeErrorLine(`${filePath}(${line},${column}): error ${errorCode}: ${message}`);
  };

  public fileWarning: WriteFileIssueFunction = (
    filePath: string,
    line: number,
    column: number,
    errorCode: string,
    message: string
  ): void => {
    this._terminal.writeWarningLine(`${filePath}(${line},${column}): warning ${errorCode}: ${message}`);
  };
}
