// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

console.log('CommandLineParameterProvider.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
import * as argparse from 'argparse';
console.log('CommandLineParameterProvider.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);
import {
  ICommandLineFlagDefinition,
  ICommandLineStringDefinition,
  ICommandLineStringListDefinition,
  ICommandLineIntegerDefinition,
  ICommandLineChoiceDefinition,
  ICommandLineRemainderDefinition
} from '../parameters/CommandLineDefinition';
console.log('CommandLineParameterProvider.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);
import {
  CommandLineParameter,
  CommandLineParameterWithArgument,
  CommandLineParameterKind
} from '../parameters/BaseClasses';
console.log('CommandLineParameterProvider.ts  : 4: ' + (new Date().getTime() % 20000) / 1000.0);
import { CommandLineFlagParameter } from '../parameters/CommandLineFlagParameter';
console.log('CommandLineParameterProvider.ts  : 5: ' + (new Date().getTime() % 20000) / 1000.0);
import { CommandLineStringParameter } from '../parameters/CommandLineStringParameter';
console.log('CommandLineParameterProvider.ts  : 6: ' + (new Date().getTime() % 20000) / 1000.0);
import { CommandLineStringListParameter } from '../parameters/CommandLineStringListParameter';
console.log('CommandLineParameterProvider.ts  : 7: ' + (new Date().getTime() % 20000) / 1000.0);
import { CommandLineIntegerParameter } from '../parameters/CommandLineIntegerParameter';
console.log('CommandLineParameterProvider.ts  : 8: ' + (new Date().getTime() % 20000) / 1000.0);
import { CommandLineChoiceParameter } from '../parameters/CommandLineChoiceParameter';
console.log('CommandLineParameterProvider.ts  : 9: ' + (new Date().getTime() % 20000) / 1000.0);
import { CommandLineRemainder } from '../parameters/CommandLineRemainder';
console.log('CommandLineParameterProvider.ts  : 10: ' + (new Date().getTime() % 20000) / 1000.0);

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
  private static _keyCounter: number = 0;

  private _parameters: CommandLineParameter[];
  private _parametersByLongName: Map<string, CommandLineParameter>;

  private _remainder: CommandLineRemainder | undefined;

  /** @internal */
  // Third party code should not inherit subclasses or call this constructor
  public constructor() {
    this._parameters = [];
    this._parametersByLongName = new Map<string, CommandLineParameter>();
  }

  /**
   * Returns a collection of the parameters that were defined for this object.
   */
  public get parameters(): ReadonlyArray<CommandLineParameter> {
    return this._parameters;
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
  public getChoiceParameter(parameterLongName: string): CommandLineChoiceParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.Choice);
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
  public getFlagParameter(parameterLongName: string): CommandLineFlagParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.Flag);
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
  public getIntegerParameter(parameterLongName: string): CommandLineIntegerParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.Integer);
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
  public getStringParameter(parameterLongName: string): CommandLineStringParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.String);
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

    const argparseOptions: argparse.ArgumentOptions = {
      help: this._remainder.description,
      nargs: argparse.Const.REMAINDER,
      metavar: '"..."'
    };

    this._getArgumentParser().addArgument(argparse.Const.REMAINDER, argparseOptions);

    return this._remainder;
  }

  /**
   * Returns the CommandLineStringListParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getStringListParameter(parameterLongName: string): CommandLineStringListParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.StringList);
  }

  /**
   * Generates the command-line help text.
   */
  public renderHelpText(): string {
    return this._getArgumentParser().formatHelp();
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
  protected _processParsedData(data: ICommandLineParserData): void {
    // Fill in the values for the parameters
    for (const parameter of this._parameters) {
      const value: any = data[parameter._parserKey]; // eslint-disable-line @typescript-eslint/no-explicit-any
      parameter._setValue(value);
    }

    if (this.remainder) {
      this.remainder._setValue(data[argparse.Const.REMAINDER]);
    }
  }

  private _generateKey(): string {
    return 'key_' + (CommandLineParameterProvider._keyCounter++).toString();
  }

  private _getParameter<T extends CommandLineParameter>(
    parameterLongName: string,
    expectedKind: CommandLineParameterKind
  ): T {
    const parameter: CommandLineParameter | undefined = this._parametersByLongName.get(parameterLongName);
    if (!parameter) {
      throw new Error(`The parameter "${parameterLongName}" is not defined`);
    }
    if (parameter.kind !== expectedKind) {
      throw new Error(
        `The parameter "${parameterLongName}" is of type "${CommandLineParameterKind[parameter.kind]}"` +
          ` whereas the caller was expecting "${CommandLineParameterKind[expectedKind]}".`
      );
    }
    return parameter as T;
  }

  private _defineParameter(parameter: CommandLineParameter): void {
    if (this._remainder) {
      throw new Error(
        'defineCommandLineRemainder() was already called for this provider;' +
          ' no further parameters can be defined'
      );
    }

    const names: string[] = [];
    if (parameter.shortName) {
      names.push(parameter.shortName);
    }
    names.push(parameter.longName);

    parameter._parserKey = this._generateKey();

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
      case CommandLineParameterKind.Choice:
        const choiceParameter: CommandLineChoiceParameter = parameter as CommandLineChoiceParameter;
        argparseOptions.choices = choiceParameter.alternatives as string[];
        break;
      case CommandLineParameterKind.Flag:
        argparseOptions.action = 'storeTrue';
        break;
      case CommandLineParameterKind.Integer:
        argparseOptions.type = 'int';
        break;
      case CommandLineParameterKind.String:
        break;
      case CommandLineParameterKind.StringList:
        argparseOptions.action = 'append';
        break;
    }

    this._getArgumentParser().addArgument(names, argparseOptions);

    this._parameters.push(parameter);
    this._parametersByLongName.set(parameter.longName, parameter);
  }
}
