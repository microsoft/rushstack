// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as argparse from 'argparse';

import type {
  ICommandLineChoiceDefinition,
  ICommandLineChoiceListDefinition,
  ICommandLineIntegerDefinition,
  ICommandLineIntegerListDefinition,
  ICommandLineFlagDefinition,
  ICommandLineStringDefinition,
  ICommandLineStringListDefinition,
  ICommandLineRemainderDefinition
} from '../parameters/CommandLineDefinition';
import type { ICommandLineParserOptions } from './CommandLineParser';
import {
  CommandLineParameter,
  CommandLineParameterWithArgument,
  CommandLineParameterKind
} from '../parameters/BaseClasses';
import { CommandLineChoiceParameter } from '../parameters/CommandLineChoiceParameter';
import { CommandLineChoiceListParameter } from '../parameters/CommandLineChoiceListParameter';
import { CommandLineIntegerParameter } from '../parameters/CommandLineIntegerParameter';
import { CommandLineIntegerListParameter } from '../parameters/CommandLineIntegerListParameter';
import { CommandLineFlagParameter } from '../parameters/CommandLineFlagParameter';
import { CommandLineStringParameter } from '../parameters/CommandLineStringParameter';
import { CommandLineStringListParameter } from '../parameters/CommandLineStringListParameter';
import { CommandLineRemainder } from '../parameters/CommandLineRemainder';
import { SCOPING_PARAMETER_GROUP } from '../Constants';

/**
 * The result containing the parsed paramter long name and scope. Returned when calling
 * {@link CommandLineParameterProvider.parseScopedLongName}.
 *
 * @public
 */
export interface IScopedLongNameParseResult {
  /**
   * The long name parsed from the scoped long name, e.g. "--my-scope:my-parameter" -\> "--my-parameter"
   */
  longName: string;

  /**
   * The scope parsed from the scoped long name or undefined if no scope was found,
   * e.g. "--my-scope:my-parameter" -\> "my-scope"
   */
  scope: string | undefined;
}

/**
 * This is the argparse result data object
 * @internal
 */
export interface ICommandLineParserData {
  action: string;
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * This is the common base class for CommandLineAction and CommandLineParser
 * that provides functionality for defining command-line parameters.
 *
 * @public
 */
export abstract class CommandLineParameterProvider {
  private static readonly _scopeGroupName: string = 'scope';
  private static readonly _longNameGroupName: string = 'longName';
  private static readonly _possiblyScopedLongNameRegex: RegExp =
    /^--((?<scope>[a-z0-9]+(-[a-z0-9]+)*):)?(?<longName>[a-z0-9]+((-[a-z0-9]+)+)?)$/;
  private static _keyCounter: number = 0;

  private _parameters: CommandLineParameter[];
  private _parametersByLongName: Map<string, CommandLineParameter[]>;
  private _parameterGroupsByName: Map<string | typeof SCOPING_PARAMETER_GROUP, argparse.ArgumentGroup>;
  private _parametersRegistered: boolean;
  private _parametersProcessed: boolean;
  private _remainder: CommandLineRemainder | undefined;

  /** @internal */
  // Third party code should not inherit subclasses or call this constructor
  public constructor() {
    this._parameters = [];
    this._parametersByLongName = new Map();
    this._parameterGroupsByName = new Map();
    this._parametersRegistered = false;
    this._parametersProcessed = false;
  }

  /**
   * Returns an object with the parsed scope (if present) and the long name of the parameter.
   */
  public static parseScopedLongName(scopedLongName: string): IScopedLongNameParseResult {
    const result: RegExpExecArray | null =
      CommandLineParameterProvider._possiblyScopedLongNameRegex.exec(scopedLongName);
    if (!result || !result.groups) {
      throw new Error(`The parameter long name "${scopedLongName}" is not valid.`);
    }
    return {
      longName: `--${result.groups[CommandLineParameterProvider._longNameGroupName]}`,
      scope: result.groups[CommandLineParameterProvider._scopeGroupName]
    };
  }

  /**
   * Returns a collection of the parameters that were defined for this object.
   */
  public get parameters(): ReadonlyArray<CommandLineParameter> {
    return this._parameters;
  }

  /**
   * Informs the caller if the argparse data has been processed into parameters.
   */
  public get parametersProcessed(): boolean {
    return this._parametersProcessed;
  }

  /**
   * If {@link CommandLineParameterProvider.defineCommandLineRemainder} was called,
   * this object captures any remaining command line arguments after the recognized portion.
   */
  public get remainder(): CommandLineRemainder | undefined {
    return this._remainder;
  }

  /**
   * Defines a command-line parameter whose value must be a string from a fixed set of
   * allowable choices (similar to an enum).
   *
   * @remarks
   * Example of a choice parameter:
   * ```
   * example-tool --log-level warn
   * ```
   */
  public defineChoiceParameter(definition: ICommandLineChoiceDefinition): CommandLineChoiceParameter {
    const parameter: CommandLineChoiceParameter = new CommandLineChoiceParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineChoiceParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getChoiceParameter(parameterLongName: string, parameterScope?: string): CommandLineChoiceParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.Choice, parameterScope);
  }

  /**
   * Defines a command-line parameter whose value must be a string from a fixed set of
   * allowable choices (similar to an enum). The parameter can be specified multiple times to
   * build a list.
   *
   * @remarks
   * Example of a choice list parameter:
   * ```
   * example-tool --allow-color red --allow-color green
   * ```
   */
  public defineChoiceListParameter(
    definition: ICommandLineChoiceListDefinition
  ): CommandLineChoiceListParameter {
    const parameter: CommandLineChoiceListParameter = new CommandLineChoiceListParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineChoiceListParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getChoiceListParameter(
    parameterLongName: string,
    parameterScope?: string
  ): CommandLineChoiceListParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.ChoiceList, parameterScope);
  }

  /**
   * Defines a command-line switch whose boolean value is true if the switch is provided,
   * and false otherwise.
   *
   * @remarks
   * Example usage of a flag parameter:
   * ```
   * example-tool --debug
   * ```
   */
  public defineFlagParameter(definition: ICommandLineFlagDefinition): CommandLineFlagParameter {
    const parameter: CommandLineFlagParameter = new CommandLineFlagParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineFlagParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getFlagParameter(parameterLongName: string, parameterScope?: string): CommandLineFlagParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.Flag, parameterScope);
  }

  /**
   * Defines a command-line parameter whose argument is an integer.
   *
   * @remarks
   * Example usage of an integer parameter:
   * ```
   * example-tool --max-attempts 5
   * ```
   */
  public defineIntegerParameter(definition: ICommandLineIntegerDefinition): CommandLineIntegerParameter {
    const parameter: CommandLineIntegerParameter = new CommandLineIntegerParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineIntegerParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getIntegerParameter(
    parameterLongName: string,
    parameterScope?: string
  ): CommandLineIntegerParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.Integer, parameterScope);
  }

  /**
   * Defines a command-line parameter whose argument is an integer. The parameter can be specified
   * multiple times to build a list.
   *
   * @remarks
   * Example usage of an integer list parameter:
   * ```
   * example-tool --avoid 4 --avoid 13
   * ```
   */
  public defineIntegerListParameter(
    definition: ICommandLineIntegerListDefinition
  ): CommandLineIntegerListParameter {
    const parameter: CommandLineIntegerListParameter = new CommandLineIntegerListParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineIntegerParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getIntegerListParameter(
    parameterLongName: string,
    parameterScope?: string
  ): CommandLineIntegerListParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.IntegerList, parameterScope);
  }

  /**
   * Defines a command-line parameter whose argument is a single text string.
   *
   * @remarks
   * Example usage of a string parameter:
   * ```
   * example-tool --message "Hello, world!"
   * ```
   */
  public defineStringParameter(definition: ICommandLineStringDefinition): CommandLineStringParameter {
    const parameter: CommandLineStringParameter = new CommandLineStringParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineStringParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getStringParameter(parameterLongName: string, parameterScope?: string): CommandLineStringParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.String, parameterScope);
  }

  /**
   * Defines a command-line parameter whose argument is a single text string.  The parameter can be
   * specified multiple times to build a list.
   *
   * @remarks
   * Example usage of a string list parameter:
   * ```
   * example-tool --add file1.txt --add file2.txt --add file3.txt
   * ```
   */
  public defineStringListParameter(
    definition: ICommandLineStringListDefinition
  ): CommandLineStringListParameter {
    const parameter: CommandLineStringListParameter = new CommandLineStringListParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Defines a rule that captures any remaining command line arguments after the recognized portion.
   *
   * @remarks
   * This feature is useful for commands that pass their arguments along to an external tool, relying on
   * that tool to perform validation.  (It could also be used to parse parameters without any validation
   * or documentation, but that is not recommended.)
   *
   * Example of capturing the remainder after an optional flag parameter.
   * ```
   * example-tool --my-flag this is the remainder
   * ```
   *
   * In the "--help" documentation, the remainder rule will be represented as "...".
   */
  public defineCommandLineRemainder(definition: ICommandLineRemainderDefinition): CommandLineRemainder {
    if (this._remainder) {
      throw new Error('defineRemainingArguments() has already been called for this provider');
    }
    this._remainder = new CommandLineRemainder(definition);
    return this._remainder;
  }

  /**
   * Returns the CommandLineStringListParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getStringListParameter(
    parameterLongName: string,
    parameterScope?: string
  ): CommandLineStringListParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.StringList, parameterScope);
  }

  /**
   * Generates the command-line help text.
   */
  public renderHelpText(): string {
    this._registerDefinedParameters();
    return this._getArgumentParser().formatHelp();
  }

  /**
   * Generates the command-line usage text.
   */
  public renderUsageText(): string {
    this._registerDefinedParameters();
    return this._getArgumentParser().formatUsage();
  }

  /**
   * Returns a object which maps the long name of each parameter in this.parameters
   * to the stringified form of its value. This is useful for logging telemetry, but
   * it is not the proper way of accessing parameters or their values.
   */
  public getParameterStringMap(): Record<string, string> {
    const parameterMap: Record<string, string> = {};
    for (const parameter of this.parameters) {
      const parameterName: string = parameter.scopedLongName || parameter.longName;
      switch (parameter.kind) {
        case CommandLineParameterKind.Flag:
        case CommandLineParameterKind.Choice:
        case CommandLineParameterKind.String:
        case CommandLineParameterKind.Integer:
          parameterMap[parameterName] = JSON.stringify(
            (
              parameter as
                | CommandLineFlagParameter
                | CommandLineIntegerParameter
                | CommandLineChoiceParameter
                | CommandLineStringParameter
            ).value
          );
          break;
        case CommandLineParameterKind.StringList:
        case CommandLineParameterKind.IntegerList:
        case CommandLineParameterKind.ChoiceList:
          const arrayValue: ReadonlyArray<string | number> | undefined = (
            parameter as
              | CommandLineIntegerListParameter
              | CommandLineStringListParameter
              | CommandLineChoiceListParameter
          ).values;
          parameterMap[parameterName] = arrayValue ? arrayValue.join(',') : '';
          break;
      }
    }
    return parameterMap;
  }

  /** @internal */
  public _registerDefinedParameters(): void {
    if (this._parametersRegistered) {
      // We prevent new parameters from being defined after the first call to _registerDefinedParameters,
      // so we can already ensure that all parameters were registered.
      return;
    }
    this._parametersRegistered = true;

    for (const longNameParameters of this._parametersByLongName.values()) {
      const useScopedLongName: boolean = longNameParameters.length > 1;
      for (const parameter of longNameParameters) {
        if (useScopedLongName && !parameter.parameterScope) {
          throw new Error(
            `The parameter "${parameter.longName}" is defined multiple times with the same long name. ` +
              'Parameters with the same long name must define a scope.'
          );
        }
        this._registerParameter(parameter, useScopedLongName);
      }
    }

    // Need to add the remainder parameter last
    if (this._remainder) {
      const argparseOptions: argparse.ArgumentOptions = {
        help: this._remainder.description,
        nargs: argparse.Const.REMAINDER,
        metavar: '"..."'
      };

      this._getArgumentParser().addArgument(argparse.Const.REMAINDER, argparseOptions);
    }
  }

  /**
   * The child class should implement this hook to define its command-line parameters,
   * e.g. by calling defineFlagParameter().
   */
  protected abstract onDefineParameters(): void;

  /**
   * Retrieves the argparse object.
   * @internal
   */
  protected abstract _getArgumentParser(): argparse.ArgumentParser;

  /** @internal */
  protected _processParsedData(parserOptions: ICommandLineParserOptions, data: ICommandLineParserData): void {
    if (!this._parametersRegistered) {
      throw new Error('Parameters have not been registered');
    }

    if (this._parametersProcessed) {
      throw new Error('Command Line Parser Data was already processed');
    }

    // Fill in the values for the parameters
    for (const parameter of this._parameters) {
      const value: any = data[parameter._parserKey!]; // eslint-disable-line @typescript-eslint/no-explicit-any
      parameter._setValue(value);
    }

    if (this.remainder) {
      this.remainder._setValue(data[argparse.Const.REMAINDER]);
    }

    this._parametersProcessed = true;
  }

  /** @internal */
  protected _defineParameter(parameter: CommandLineParameter): void {
    if (this._parametersRegistered) {
      throw new Error('Parameters have already been registered for this provider');
    }

    // Generate and set the parser key at definition time
    parameter._parserKey = this._generateKey();

    this._parameters.push(parameter);

    // Collect all parameters with the same long name. We will perform conflict resolution at registration.
    let longNameParameters: CommandLineParameter[] | undefined = this._parametersByLongName.get(
      parameter.longName
    );
    if (!longNameParameters) {
      longNameParameters = [];
      this._parametersByLongName.set(parameter.longName, longNameParameters);
    }
    longNameParameters.push(parameter);
  }

  /** @internal */
  protected _registerParameter(parameter: CommandLineParameter, useScopedLongName: boolean): void {
    const names: string[] = [];
    if (parameter.shortName) {
      names.push(parameter.shortName);
    }

    // Use the original long name unless otherwise requested
    if (!useScopedLongName) {
      names.push(parameter.longName);
    }

    // Add the scoped long name if it exists
    if (parameter.scopedLongName) {
      names.push(parameter.scopedLongName);
    }

    let finalDescription: string = parameter.description;

    const supplementaryNotes: string[] = [];
    parameter._getSupplementaryNotes(supplementaryNotes);
    if (supplementaryNotes.length > 0) {
      // If they left the period off the end of their sentence, then add one.
      if (finalDescription.match(/[a-z0-9]"?\s*$/i)) {
        finalDescription = finalDescription.trimRight() + '.';
      }
      // Append the supplementary text
      finalDescription += ' ' + supplementaryNotes.join(' ');
    }

    // NOTE: Our "environmentVariable" feature takes precedence over argparse's "defaultValue",
    // so we have to reimplement that feature.
    const argparseOptions: argparse.ArgumentOptions = {
      help: finalDescription,
      dest: parameter._parserKey,
      metavar: (parameter as CommandLineParameterWithArgument).argumentName || undefined,
      required: parameter.required
    };

    switch (parameter.kind) {
      case CommandLineParameterKind.Choice: {
        const choiceParameter: CommandLineChoiceParameter = parameter as CommandLineChoiceParameter;
        argparseOptions.choices = choiceParameter.alternatives as string[];
        break;
      }
      case CommandLineParameterKind.ChoiceList: {
        const choiceParameter: CommandLineChoiceListParameter = parameter as CommandLineChoiceListParameter;
        argparseOptions.choices = choiceParameter.alternatives as string[];
        argparseOptions.action = 'append';
        break;
      }
      case CommandLineParameterKind.Flag:
        argparseOptions.action = 'storeTrue';
        break;
      case CommandLineParameterKind.Integer:
        argparseOptions.type = 'int';
        break;
      case CommandLineParameterKind.IntegerList:
        argparseOptions.type = 'int';
        argparseOptions.action = 'append';
        break;
      case CommandLineParameterKind.String:
        break;
      case CommandLineParameterKind.StringList:
        argparseOptions.action = 'append';
        break;
    }

    let argumentGroup: argparse.ArgumentGroup | undefined;
    if (parameter.parameterGroup) {
      argumentGroup = this._parameterGroupsByName.get(parameter.parameterGroup);
      if (!argumentGroup) {
        let parameterGroupName: string;
        if (typeof parameter.parameterGroup === 'string') {
          parameterGroupName = parameter.parameterGroup;
        } else if (parameter.parameterGroup === SCOPING_PARAMETER_GROUP) {
          parameterGroupName = 'scoping';
        } else {
          throw new Error('Unexpected parameter group: ' + parameter.parameterGroup);
        }

        argumentGroup = this._getArgumentParser().addArgumentGroup({
          title: `Optional ${parameterGroupName} arguments`
        });
        this._parameterGroupsByName.set(parameter.parameterGroup, argumentGroup);
      }
    } else {
      argumentGroup = this._getArgumentParser();
    }

    argumentGroup.addArgument(names, { ...argparseOptions });

    if (parameter.undocumentedSynonyms && parameter.undocumentedSynonyms.length > 0) {
      argumentGroup.addArgument(parameter.undocumentedSynonyms, {
        ...argparseOptions,
        help: argparse.Const.SUPPRESS
      });
    }
  }

  private _generateKey(): string {
    return 'key_' + (CommandLineParameterProvider._keyCounter++).toString();
  }

  private _getParameter<T extends CommandLineParameter>(
    parameterLongName: string,
    expectedKind: CommandLineParameterKind,
    parameterScope?: string
  ): T {
    // Support the parameter long name being prefixed with the scope
    const { scope, longName } = CommandLineParameterProvider.parseScopedLongName(parameterLongName);
    parameterLongName = longName;
    parameterScope = scope || parameterScope;

    const parameters: CommandLineParameter[] | undefined = this._parametersByLongName.get(parameterLongName);
    if (!parameters) {
      throw new Error(`The parameter "${parameterLongName}" is not defined`);
    }

    const parameter: CommandLineParameter | undefined = parameters.find(
      (p) => p.parameterScope === parameterScope
    );
    if (!parameter) {
      throw new Error(`The parameter "${parameterLongName}" with scope "${parameterScope}" is not defined.`);
    }

    if (parameter.kind !== expectedKind) {
      throw new Error(
        `The parameter "${parameterLongName}" is of type "${CommandLineParameterKind[parameter.kind]}"` +
          ` whereas the caller was expecting "${CommandLineParameterKind[expectedKind]}".`
      );
    }
    return parameter as T;
  }
}
