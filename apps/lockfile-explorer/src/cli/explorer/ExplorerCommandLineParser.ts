// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConsoleTerminalProvider, type ITerminal, Terminal } from '@rushstack/terminal';
import {
  type CommandLineFlagParameter,
  CommandLineParser,
  type CommandLineStringParameter
} from '@rushstack/ts-command-line';

import { StartAction } from './actions/StartAction';

const EXPLORER_TOOL_FILENAME: 'lockfile-explorer' = 'lockfile-explorer';

export class ExplorerCommandLineParser extends CommandLineParser {
  public readonly globalTerminal: ITerminal;
  private readonly _terminalProvider: ConsoleTerminalProvider;
  private readonly _debugParameter: CommandLineFlagParameter;
  private readonly _subspaceParameter: CommandLineStringParameter;

  public constructor() {
    super({
      toolFilename: EXPLORER_TOOL_FILENAME,
      toolDescription: 'lockfile-lint is a tool for linting lockfiles.'
    });

    this._debugParameter = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });

    this._subspaceParameter = this.defineStringParameter({
      parameterLongName: '--subspace',
      argumentName: 'SUBSPACE_NAME',
      description: 'Specifies an individual Rush subspace to check.'
    });

    this._terminalProvider = new ConsoleTerminalProvider();
    this.globalTerminal = new Terminal(this._terminalProvider);

    this._populateActions();
  }

  private _populateActions(): void {
    this.addAction(new StartAction(this));
  }

  public get isDebug(): boolean {
    return this._debugParameter.value;
  }

  public get subspace(): string {
    return this._subspaceParameter.value ?? 'default';
  }
}
