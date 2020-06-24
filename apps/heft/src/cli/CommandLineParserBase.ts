// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineParser,
  CommandLineStringListParameter,
  CommandLineFlagParameter,
  ICommandLineParserOptions
} from '@rushstack/ts-command-line';
import {
  Terminal,
  InternalError,
  ConsoleTerminalProvider,
  ITerminalProvider
} from '@rushstack/node-core-library';

export class CommandLineParserBase extends CommandLineParser {
  private _terminalProvider: ConsoleTerminalProvider;
  private _terminal: Terminal;

  private _debugFlag: CommandLineFlagParameter;
  private _pluginsParameter: CommandLineStringListParameter;

  public get isDebug(): boolean {
    return this._debugFlag.value;
  }

  public get terminalProvider(): ITerminalProvider {
    return this._terminalProvider;
  }

  public get terminal(): Terminal {
    return this._terminal;
  }

  public constructor(options: ICommandLineParserOptions) {
    super(options);

    this._terminalProvider = new ConsoleTerminalProvider();
    this._terminal = new Terminal(this._terminalProvider);
  }

  protected onDefineParameters(): void {
    this._debugFlag = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });

    this._pluginsParameter = this.defineStringListParameter({
      parameterLongName: '--plugin',
      argumentName: 'PATH',
      description: 'Used to specify Heft plugins.'
    });
  }

  protected async onExecute(): Promise<void> {
    // Defensively set the exit code to 1 so if the tool crashes for whatever reason, we'll have a nonzero exit code.
    process.exitCode = 1;

    this._terminalProvider.verboseEnabled = this.isDebug;

    if (this.isDebug) {
      InternalError.breakInDebugger = true;
    }

    this.initializePlugins(this._pluginsParameter.values);

    try {
      await super.onExecute();
    } catch (e) {
      await this._reportErrorAndSetExitCode(e);
    }

    // If we make it here, things are fine and reset the exit code back to 0
    process.exitCode = 0;
  }

  /**
   * @virtual
   */
  protected initializePlugins(pluginSpecifiers: ReadonlyArray<string>): void {
    // no-op by default
  }

  private async _reportErrorAndSetExitCode(error: Error): Promise<void> {
    this.terminal.writeErrorLine(error.toString());

    if (this.isDebug) {
      this._terminal.writeLine();
      this._terminal.writeErrorLine(error.stack!);
    }

    if (!process.exitCode || process.exitCode > 0) {
      process.exit(process.exitCode);
    } else {
      process.exit(1);
    }
  }
}
