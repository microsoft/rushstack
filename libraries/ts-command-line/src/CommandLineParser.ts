// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as argparse from 'argparse';
import * as colors from 'colors';

import CommandLineAction from './CommandLineAction';
import { ICommandLineParserData } from './CommandLineParameter';
import CommandLineParameterProvider from './CommandLineParameterProvider';

/**
 * Options for the {@link CommandLineParser} constructor.
 * @public
 */
export interface ICommandListParserOptions {
  /**
   * The name of your tool when invoked from the command line
   */
  toolFilename: string;

  /**
   * General documentation that is included in the "--help" main page
   */
  toolDescription: string;
}

/**
 * The "argparse" library is a relatively advanced command-line parser with features such
 * as word-wrapping and intelligible error messages (that are lacking in other similar
 * libraries such as commander, yargs, and nomnom).  Unfortunately, its ruby-inspired API
 * is awkward to use.  The abstract base classes CommandLineParser and CommandLineAction
 * provide a wrapper for "argparse" that makes defining and consuming arguments quick
 * and simple, and enforces that appropriate documentation is provided for each parameter.
 *
 * @public
 */
abstract class CommandLineParser extends CommandLineParameterProvider {
  /**
   * Reports which CommandLineAction was selected on the command line.
   * @remarks
   * The value will be assigned before onExecute() is invoked.
   */
  protected selectedAction: CommandLineAction;

  private _actionsSubParser: argparse.SubParser;
  private _options: ICommandListParserOptions;
  private _actions: CommandLineAction[];

  constructor(options: ICommandListParserOptions) {
    super();

    this._options = options;
    this._actions = [];

    this._argumentParser = new argparse.ArgumentParser({
      addHelp: true,
      prog: this._options.toolFilename,
      description: this._options.toolDescription,
      epilog: colors.bold('For detailed help about a specific command, use:'
        + ` ${this._options.toolFilename} <command> -h`)
    });

    this._actionsSubParser = this._argumentParser.addSubparsers({
      metavar: '<command>',
      dest: 'action'
    });

    this.onDefineParameters();
  }

  /**
   * Defines a new action that can be used with the CommandLineParser instance.
   */
  public addAction(command: CommandLineAction): void {
    command._buildParser(this._actionsSubParser);
    this._actions.push(command);
  }

  /**
   * The program entry point will call this method to begin parsing command-line arguments
   * and executing the corresponding action.
   *
   * @remarks
   * The returned promise will never reject:  If an error occurs, it will be printed
   * to stderr, process.exitCode will be set to 1, and the promise will resolve to false.
   * This simplifies the most common usage scenario where the program entry point doesn't
   * want to be involved with the command-line logic, and will discard the promise without
   * a then() or catch() block.
   *
   * If your caller wants to trap and handle errors, use {@link CommandLineParser.executeWithoutErrorHandling}
   * instead.
   *
   * @param args - the command-line arguments to be parsed; if omitted, then
   *               the process.argv will be used
   */
  public execute(args?: string[]): Promise<boolean> {
    return this.executeWithoutErrorHandling(args).then(() => {
      return true;
    }).catch((e) => {
      const message: string = (e.message || 'An unknown error occurred').trim();
      console.error(colors.red('Error: ' + message));
      process.exitCode = 1;
      return false;
    });
  }

  /**
   * This is similar to {@link CommandLineParser.execute}, except that execution errors
   * simply cause the promise to reject.  It is the caller's responsibility to trap
   */
  public executeWithoutErrorHandling(args?: string[]): Promise<void> {
    try {
      if (!args) {
        // 0=node.exe, 1=script name
        args = process.argv.slice(2);
      }
      if (args.length === 0) {
        this._argumentParser.printHelp();
        return Promise.resolve();
      }
      const data: ICommandLineParserData = this._argumentParser.parseArgs();

      this._processParsedData(data);

      for (const action of this._actions) {
        if (action.options.actionVerb === data.action) {
          this.selectedAction = action;
          action._processParsedData(data);
          break;
        }
      }
      if (!this.selectedAction) {
        throw Error('Unrecognized action');
      }

      return this.onExecute();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * This hook allows the subclass to perform additional operations before or after
   * the chosen action is executed.
   */
  protected onExecute(): Promise<void> {
    return this.selectedAction._execute();
  }
}

export default CommandLineParser;
