// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as argparse from 'argparse';

import { Colorize } from '@rushstack/terminal';

import type { CommandLineAction } from './CommandLineAction';
import type { AliasCommandLineAction } from './AliasCommandLineAction';
import {
  CommandLineParameterProvider,
  type IRegisterDefinedParametersState,
  type ICommandLineParserData
} from './CommandLineParameterProvider';
import { CommandLineParserExitError, CustomArgumentParser } from './CommandLineParserExitError';
import { TabCompleteAction } from './TabCompletionAction';
import { TypeUuid, uuidAlreadyReportedError } from '../TypeUuidLite';
import { escapeSprintf } from '../escapeSprintf';

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

  /**
   * An optional string to append at the end of the "--help" main page. If not provided, an epilog
   * will be automatically generated based on the toolFilename.
   */
  toolEpilog?: string;

  /**
   * Set to true to auto-define a tab completion action. False by default.
   */
  enableTabCompletionAction?: boolean;
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
  /**
   * Reports which CommandLineAction was specified on the command line.
   * @remarks
   * The value will be assigned before onExecute() is invoked.
   */
  public selectedAction: CommandLineAction | undefined;

  private readonly _argumentParser: argparse.ArgumentParser;
  private _actionsSubParser: argparse.SubParser | undefined;
  private readonly _options: ICommandLineParserOptions;
  private readonly _actions: CommandLineAction[];
  private readonly _actionsByName: Map<string, CommandLineAction>;
  private _executed: boolean = false;
  private _tabCompleteActionWasAdded: boolean = false;

  public constructor(options: ICommandLineParserOptions) {
    super();

    this._options = options;
    this._actions = [];
    this._actionsByName = new Map<string, CommandLineAction>();

    const { toolFilename, toolDescription, toolEpilog } = options;

    this._argumentParser = new CustomArgumentParser({
      addHelp: true,
      prog: toolFilename,
      description: escapeSprintf(toolDescription),
      epilog: Colorize.bold(
        escapeSprintf(
          toolEpilog ?? `For detailed help about a specific command, use: ${toolFilename} <command> -h`
        )
      )
    });
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
   * If your caller wants to trap and handle errors, use {@link CommandLineParser.executeWithoutErrorHandlingAsync}
   * instead.
   *
   * @param args - the command-line arguments to be parsed; if omitted, then
   *               the process.argv will be used
   */
  public async executeAsync(args?: string[]): Promise<boolean> {
    if (this._options.enableTabCompletionAction && !this._tabCompleteActionWasAdded) {
      this.addAction(new TabCompleteAction(this.actions, this.parameters));
      this._tabCompleteActionWasAdded = true;
    }

    try {
      await this.executeWithoutErrorHandlingAsync(args);
      return true;
    } catch (err) {
      if (err instanceof CommandLineParserExitError) {
        // executeWithoutErrorHandlingAsync() handles the successful cases,
        // so here we can assume err has a nonzero exit code
        if (err.message) {
          // eslint-disable-next-line no-console
          console.error(err.message);
        }
        if (!process.exitCode) {
          process.exitCode = err.exitCode;
        }
      } else if (TypeUuid.isInstanceOf(err, uuidAlreadyReportedError)) {
        //  AlreadyReportedError
        if (!process.exitCode) {
          process.exitCode = 1;
        }
      } else {
        let message: string = ((err as Error).message || 'An unknown error occurred').trim();

        // If the message doesn't already start with "Error:" then add a prefix
        if (!/^(error|internal error|warning)\b/i.test(message)) {
          message = 'Error: ' + message;
        }

        // eslint-disable-next-line no-console
        console.error();
        // eslint-disable-next-line no-console
        console.error(Colorize.red(message));

        if (!process.exitCode) {
          process.exitCode = 1;
        }
      }

      return false;
    }
  }

  /**
   * This is similar to {@link CommandLineParser.executeAsync}, except that execution errors
   * simply cause the promise to reject.  It is the caller's responsibility to trap
   */
  public async executeWithoutErrorHandlingAsync(args?: string[]): Promise<void> {
    try {
      if (this._executed) {
        // In the future we could allow the same parser to be invoked multiple times
        // with different arguments.  We'll do that work as soon as someone encounters
        // a real world need for it.
        throw new Error('executeAsync() was already called for this parser instance');
      }
      this._executed = true;

      this._validateDefinitions();

      // Register the parameters before we print help or parse the CLI
      const initialState: IRegisterDefinedParametersState = {
        parentParameterNames: new Set()
      };
      this._registerDefinedParameters(initialState);

      if (!args) {
        // 0=node.exe, 1=script name
        args = process.argv.slice(2);
      }
      if (this.actions.length > 0) {
        if (args.length === 0) {
          // Parsers that use actions should print help when 0 args are provided. Allow
          // actionless parsers to continue on zero args.
          this._argumentParser.printHelp();
          return;
        }
        // Alias actions may provide a list of default params to add after the action name.
        // Since we don't know which params are required and which are optional, perform a
        // manual search for the action name to obtain the default params and insert them if
        // any are found. We will guess that the action name is the first arg that doesn't
        // start with a hyphen.
        const actionNameIndex: number | undefined = args.findIndex((x) => !x.startsWith('-'));
        if (actionNameIndex !== undefined) {
          const actionName: string = args[actionNameIndex];
          const action: CommandLineAction | undefined = this.tryGetAction(actionName);
          const aliasAction: AliasCommandLineAction | undefined = action as AliasCommandLineAction;
          if (aliasAction?.defaultParameters?.length) {
            const insertIndex: number = actionNameIndex + 1;
            args = args.slice(0, insertIndex).concat(aliasAction.defaultParameters, args.slice(insertIndex));
          }
        }
      }

      const postParse: () => void = () => {
        this._postParse();
        for (const action of this.actions) {
          action._postParse();
        }
      };

      function patchFormatUsageForArgumentParser(argumentParser: argparse.ArgumentParser): void {
        const originalFormatUsage: () => string = argumentParser.formatUsage.bind(argumentParser);
        argumentParser.formatUsage = () => {
          postParse();
          return originalFormatUsage();
        };
      }

      this._preParse();
      patchFormatUsageForArgumentParser(this._argumentParser);
      for (const action of this.actions) {
        action._preParse();
        patchFormatUsageForArgumentParser(action._getArgumentParser());
      }

      const data: ICommandLineParserData = this._argumentParser.parseArgs(args);

      postParse();
      this._processParsedData(this._options, data);

      this.selectedAction = this.tryGetAction(data.action);
      if (this.actions.length > 0 && !this.selectedAction) {
        const actions: string[] = this.actions.map((x) => x.actionName);
        throw new Error(`An action must be specified (${actions.join(', ')})`);
      }

      this.selectedAction?._processParsedData(this._options, data);
      await this.onExecuteAsync();
    } catch (err) {
      if (err instanceof CommandLineParserExitError) {
        if (!err.exitCode) {
          // non-error exit modeled using exception handling
          if (err.message) {
            // eslint-disable-next-line no-console
            console.log(err.message);
          }

          return;
        }
      }

      throw err;
    }
  }

  /** @internal */
  public _registerDefinedParameters(state: IRegisterDefinedParametersState): void {
    super._registerDefinedParameters(state);

    const { parentParameterNames } = state;
    const updatedParentParameterNames: Set<string> = new Set([
      ...parentParameterNames,
      ...this._registeredParameterParserKeysByName.keys()
    ]);

    const parentState: IRegisterDefinedParametersState = {
      ...state,
      parentParameterNames: updatedParentParameterNames
    };
    for (const action of this._actions) {
      action._registerDefinedParameters(parentState);
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
  protected override _getArgumentParser(): argparse.ArgumentParser {
    return this._argumentParser;
  }

  /**
   * This hook allows the subclass to perform additional operations before or after
   * the chosen action is executed.
   */
  protected async onExecuteAsync(): Promise<void> {
    if (this.selectedAction) {
      await this.selectedAction._executeAsync();
    }
  }
}
