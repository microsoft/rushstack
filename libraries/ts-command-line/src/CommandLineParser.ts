/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as argparse from 'argparse';
import * as colors from 'colors';
import CommandLineAction from './CommandLineAction';
import { ICommandLineParserData } from './CommandLineParameter';
import CommandLineParameterProvider from './CommandLineParameterProvider';

export interface ICommandListParserOptions {
  // The name of your tool when invoked from the command line
  toolFilename: string;
  // General documentation that is included in the "--help" main page
  toolDescription: string;
}

/**
 * The "argparse" library is a relatively advanced command-line parser with features such
 * as word-wrapping and intelligible error messages (that are lacking in other similar
 * libraries such as commander, yargs, and nomnom).  Unfortunately, its ruby-inspired API
 * is awkward to use.  The abstract base classes CommandLineParser and CommandLineAction
 * provide a wrapper for "argparse" that makes defining and consuming arguments quick
 * and simple, and enforces that appropriate documentation is provided for each parameter.
 */
abstract class CommandLineParser extends CommandLineParameterProvider {
  protected chosenAction: CommandLineAction;

  private _actionsSubParser: argparse.SubParser;
  private _options: ICommandListParserOptions;
  private _actions: CommandLineAction[];

  constructor(options: ICommandListParserOptions) {
    super();

    this._options = options;
    this._actions = [];

    this.argumentParser = new argparse.ArgumentParser({
      addHelp: true,
      prog: this._options.toolFilename,
      description: this._options.toolDescription,
      epilog: colors.bold('For detailed help about a specific command, use:'
        + ` ${this._options.toolFilename} <command> -h`)
    });

    this._actionsSubParser = this.argumentParser.addSubparsers({
      metavar: '<command>',
      dest: 'action'
    });

    this.onDefineParameters();
  }

  /**
   * Defines a new action that can be used with the CommandLineParser instance.
   */
  public addAction(command: CommandLineAction): void {
    command.buildParser(this._actionsSubParser);
    this._actions.push(command);
  }

  /**
   * This is the main entry point to begin parsing command-line arguments
   * and executing the corresponding action.
   *
   * @param args   the command-line arguments to be parsed; if omitted, then
   *               the process.argv will be used
   */
  public execute(args?: string[]): void {
    if (!args) {
      // 0=node.exe, 1=script name
      args = process.argv.slice(2);
    }
    if (args.length === 0) {
      this.argumentParser.printHelp();
      return;
    }
    const data: ICommandLineParserData = this.argumentParser.parseArgs();

    this.processParsedData(data);

    for (const action of this._actions) {
      if (action.options.actionVerb === data.action) {
        this.chosenAction = action;
        action.processParsedData(data);
        break;
      }
    }
    if (!this.chosenAction) {
      throw Error('Unrecognized action');
    }

    this.onExecute();
  }

  /**
   * This hook allows the subclass to perform additional operations before or after
   * the chosen action is executed.
   */
  protected onExecute(): void {
    this.chosenAction.execute();
  }
}
export default CommandLineParser;
