// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConsoleTerminalProvider, type ITerminal, Terminal } from '@rushstack/terminal';
import { CommandLineParser } from '@rushstack/ts-command-line';
import { InitAction } from './actions/InitAction';
import { LintAction } from './actions/LintAction';

const LINT_TOOL_FILENAME: 'lockfile-lint' = 'lockfile-lint';

export class LintCommandLineParser extends CommandLineParser {
  public readonly globalTerminal: ITerminal;
  private readonly _terminalProvider: ConsoleTerminalProvider;

  public constructor() {
    super({
      toolFilename: LINT_TOOL_FILENAME,
      toolDescription: 'lockfile-lint is a tool for linting lockfiles.'
    });

    this._terminalProvider = new ConsoleTerminalProvider();
    this.globalTerminal = new Terminal(this._terminalProvider);

    this._populateActions();
  }

  private _populateActions(): void {
    this.addAction(new InitAction(this));
    this.addAction(new LintAction(this));
  }
}
