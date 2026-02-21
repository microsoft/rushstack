// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConsoleTerminalProvider, type ITerminal, Terminal, Colorize } from '@rushstack/terminal';
import { CommandLineParser } from '@rushstack/ts-command-line';
import { type IPackageJson, JsonFile, PackageJsonLookup } from '@rushstack/node-core-library';

import { InitAction } from './actions/InitAction.ts';
import { CheckAction } from './actions/CheckAction.ts';

const LINT_TOOL_FILENAME: 'lockfile-lint' = 'lockfile-lint';

export class LintCommandLineParser extends CommandLineParser {
  public readonly globalTerminal: ITerminal;
  private readonly _terminalProvider: ConsoleTerminalProvider;

  public constructor() {
    super({
      toolFilename: LINT_TOOL_FILENAME,
      toolDescription:
        'Lockfile Lint applies configured policies to find and report dependency issues in your PNPM workspace.'
    });

    this._terminalProvider = new ConsoleTerminalProvider();
    this.globalTerminal = new Terminal(this._terminalProvider);

    this._populateActions();
  }

  protected override async onExecuteAsync(): Promise<void> {
    const lockfileExplorerProjectRoot: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
    const lockfileExplorerPackageJson: IPackageJson = JsonFile.load(
      `${lockfileExplorerProjectRoot}/package.json`
    );
    const appVersion: string = lockfileExplorerPackageJson.version;

    this.globalTerminal.writeLine(
      Colorize.bold(`\nRush Lockfile Lint ${appVersion}`) + Colorize.cyan(' - https://lfx.rushstack.io/\n')
    );

    await super.onExecuteAsync();
  }

  private _populateActions(): void {
    this.addAction(new InitAction(this));
    this.addAction(new CheckAction(this));
  }
}
