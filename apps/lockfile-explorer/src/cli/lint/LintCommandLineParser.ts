// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminal, Colorize } from '@rushstack/terminal';
import { CommandLineParser } from '@rushstack/ts-command-line';

import { InitAction } from './actions/InitAction';
import { CheckAction } from './actions/CheckAction';
import { LFX_VERSION } from '../../utils/constants';

const LINT_TOOL_FILENAME: 'lockfile-lint' = 'lockfile-lint';

export class LintCommandLineParser extends CommandLineParser {
  public readonly globalTerminal: ITerminal;

  public constructor(terminal: ITerminal) {
    super({
      toolFilename: LINT_TOOL_FILENAME,
      toolDescription:
        'Lockfile Lint applies configured policies to find and report dependency issues in your PNPM workspace.'
    });

    this.globalTerminal = terminal;

    this._populateActions();
  }

  protected override async onExecuteAsync(): Promise<void> {
    this.globalTerminal.writeLine(
      Colorize.bold(`\nRush Lockfile Lint ${LFX_VERSION}`) + Colorize.cyan(' - https://lfx.rushstack.io/\n')
    );

    await super.onExecuteAsync();
  }

  private _populateActions(): void {
    const terminal: ITerminal = this.globalTerminal;
    this.addAction(new InitAction(terminal));
    this.addAction(new CheckAction(terminal));
  }
}
