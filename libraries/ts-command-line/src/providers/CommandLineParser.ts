// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as argparse from 'argparse';
import * as colors from 'colors';

import { CommandLineAction } from './CommandLineAction';
import { CommandLineParameterProvider, ICommandLineParserData } from './CommandLineParameterProvider';
import { CommandLineParserExitError, CustomArgumentParser } from './CommandLineParserExitError';

/**
 * Options for the {@link CommandLineParser} constructor.
 * @public
 */
export interface ICommandLineParserOptions {
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
export abstract class CommandLineParser extends CommandLineParameterProvider {
  /** {@inheritDoc ICommandLineParserOptions.toolFilename} */
  public readonly toolFilename: string;

  /** {@inheritDoc ICommandLineParserOptions.toolDescription} */
  public readonly toolDescription: string;

  /**
   * Reports which CommandLineAction was specified on the command line.
   * @remarks
   * The value will be assigned before onExecute() is invoked.
   */
  public selectedAction: CommandLineAction | undefined;

  private _argumentParser: argparse.ArgumentParser;
  private _actionsSubParser: argparse.SubParser | undefined;
  private _options: ICommandLineParserOptions;
  private _actions: CommandLineAction[];
  private _actionsByName: Map<string, CommandLineAction>;
  private _executed: boolean = false;

  public constructor(options: ICommandLineParserOptions) {
    super();

    this._options = options;
    this._actions = [];
    this._actionsByName = new Map<string, CommandLineAction>();

    this._argumentParser = new CustomArgumentParser({
      addHelp: true,
      prog: this._options.toolFilename,
      description: this._options.toolDescription,
      epilog: colors.bold(
        `For detailed help about a specific command, use: ${this._options.toolFilename} <command> -h`
      )
    });

    this.onDefineParameters();
  }

  /**
   * Returns the list of actions that were defined for this CommandLineParser object.
   */
  public get actions(): ReadonlyArray<CommandLineAction> {
    return this._actions;
  }

  /**
   * Defines a new action that can be used with the CommandLineParser instance.
   */
  public addAction(action: CommandLineAction): void {
    if (!this._actionsSubParser) {
      this._actionsSubParser = this._argumentParser.addSubparsers({
        metavar: '<command>',
        dest: 'action'
      });
    }

    action._buildParser(this._actionsSubParser);
    this._actions.push(action);
    this._actionsByName.set(action.actionName, action);
  }

  /**
   * Retrieves the action with the specified name.  If no matching action is found,
   * an exception is thrown.
   */
  public getAction(actionName: string): CommandLineAction {
    const action: CommandLineAction | undefined = this.tryGetAction(actionName);
    if (!action) {
      throw new Error(`The action "${actionName}" was not defined`);
    }
    return action;
  }

  /**
   * Retrieves the action with the specified name.  If no matching action is found,
   * undefined is returned.
   */
  public tryGetAction(actionName: string): CommandLineAction | undefined {
    return this._actionsByName.get(actionName);
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
    return this.executeWithoutErrorHandling(args)
      .then(() => {
        return true;
      })
      .catch((err) => {
        if (err instanceof CommandLineParserExitError) {
          // executeWithoutErrorHandling() handles the successful cases,
          // so here we can assume err has a nonzero exit code
          if (err.message) {
            console.error(err.message);
          }
          if (!process.exitCode) {
            process.exitCode = err.exitCode;
          }
        } else {
          let message: string = (err.message || 'An unknown error occurred').trim();

          // If the message doesn't already start with "Error:" then add a prefix
          if (!/^(error|internal error|warning)\b/i.test(message)) {
            message = 'Error: ' + message;
          }

          console.error();
          console.error(colors.red(message));

          if (!process.exitCode) {
            process.exitCode = 1;
          }
        }
        return false;
      });
  }

  /**
   * This is similar to {@link CommandLineParser.execute}, except that execution errors
   * simply cause the promise to reject.  It is the caller's responsibility to trap
   */
  public executeWithoutErrorHandling(args?: string[]): Promise<void> {
    try {
      if (this._executed) {
        // In the future we could allow the same parser to be invoked multiple times
        // with different arguments.  We'll do that work as soon as someone encounters
        // a real world need for it.
        throw new Error('execute() was already called for this parser instance');
      }
      this._executed = true;

      this._validateDefinitions();

      if (!args) {
        // 0=node.exe, 1=script name
        args = process.argv.slice(2);
      }
      if (args.length === 0) {
        this._argumentParser.printHelp();
        return Promise.resolve();
      }
      const data: ICommandLineParserData = this._argumentParser.parseArgs(args);

      this._processParsedData(data);

      for (const action of this._actions) {
        if (action.actionName === data.action) {
          this.selectedAction = action;
          action._processParsedData(data);
          break;
        }
      }
      if (this.actions.length > 0 && !this.selectedAction) {
        const actions: string[] = this.actions.map((x) => x.actionName);
        throw new Error(`An action must be specified (${actions.join(', ')})`);
      }

      return this.onExecute();
    } catch (err) {
      if (err instanceof CommandLineParserExitError) {
        if (!err.exitCode) {
          // non-error exit modeled using exception handling
          if (err.message) {
            console.log(err.message);
          }
          return Promise.resolve();
        }
      }
      return Promise.reject(err);
    }
  }

  private _validateDefinitions(): void {
    if (this.remainder && this.actions.length > 0) {
      // This is apparently not supported by argparse
      throw new Error('defineCommandLineRemainder() cannot be called for a CommandLineParser with actions');
    }
  }

  /**
   * {@inheritDoc CommandLineParameterProvider._getArgumentParser}
   * @internal
   */
  protected _getArgumentParser(): argparse.ArgumentParser {
    // override
    return this._argumentParser;
  }

  /**
   * This hook allows the subclass to perform additional operations before or after
   * the chosen action is executed.
   */
  protected onExecute(): Promise<void> {
    if (!this.selectedAction) {
      return Promise.resolve();
    }
    return this.selectedAction._execute();
  }
}
