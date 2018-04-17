// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as argparse from 'argparse';
import {
  ICommandLineFlagDefinition,
  ICommandLineStringDefinition,
  ICommandLineStringListDefinition,
  ICommandLineIntegerDefinition,
  ICommandLineChoiceDefinition
} from './CommandLineDefinition';

import {
  CommandLineParameter,
  CommandLineParameterWithArgument,
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineStringListParameter,
  CommandLineIntegerParameter,
  CommandLineChoiceParameter,
  CommandLineParameterKind
} from './CommandLineParameter';

// (This source file uses "any" in many places for abstract parameter values)
// tslint:disable:no-any

/**
 * This is the argparse result data object
 * @internal
 */
export interface ICommandLineParserData {
  action: string;
  [key: string]: any;
}

/**
 * This is the common base class for CommandLineAction and CommandLineParser
 * that provides functionality for defining command-line parameters.
 *
 * @public
 */
export abstract class CommandLineParameterProvider {
  private static _keyCounter: number = 0;

  private _parameters: CommandLineParameter<any>[];
  private _parametersByLongName: Map<string, CommandLineParameter<any>>;

  /** @internal */
  // Third party code should not inherit subclasses or call this constructor
  constructor() {
    this._parameters = [];
    this._parametersByLongName = new Map<string, CommandLineParameter<any>>();
  }

  /**
   * Defines a command-line parameter whose value must be a string from a fixed set of
   * allowable choices (similar to an enum).
   *
   * @remarks
   * Example:  example-tool --log-level warn
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
    return this._getFlagParameter(parameterLongName, CommandLineParameterKind.Choice);
  }

  /**
   * Defines a command-line switch whose boolean value is true if the switch is provided,
   * and false otherwise.
   *
   * @remarks
   * Example:  example-tool --debug
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
    return this._getFlagParameter(parameterLongName, CommandLineParameterKind.Flag);
  }

  /**
   * Defines a command-line parameter whose value is an integer.
   *
   * @remarks
   * Example:  example-tool l --max-attempts 5
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
    return this._getFlagParameter(parameterLongName, CommandLineParameterKind.Integer);
  }

  /**
   * Defines a command-line parameter whose value is a single text string.
   *
   * @remarks
   * Example:  example-tool --message "Hello, world!"
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
    return this._getFlagParameter(parameterLongName, CommandLineParameterKind.String);
  }

  /**
   * Defines a command-line parameter whose value is one or more text strings.
   *
   * @remarks
   * Example:  example-tool --add file1.txt --add file2.txt --add file3.txt
   */
  public defineStringListParameter(definition: ICommandLineStringListDefinition): CommandLineStringListParameter {
    const parameter: CommandLineStringListParameter = new CommandLineStringListParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineStringListParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getStringListParameter(parameterLongName: string): CommandLineStringListParameter {
    return this._getFlagParameter(parameterLongName, CommandLineParameterKind.StringList);
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
      const value: any = data[parameter._parserKey];
      parameter._setValue(value);
    }
  }

  private _generateKey(): string {
    return 'key_' + (CommandLineParameterProvider._keyCounter++).toString();
  }

  private _getFlagParameter<T extends CommandLineParameter<any>>(parameterLongName: string,
    expectedKind: CommandLineParameterKind): T {

    const parameter: CommandLineParameter<any> | undefined = this._parametersByLongName.get(parameterLongName);
    if (!parameter) {
      throw new Error(`The parameter "${parameterLongName}" is not defined`);
    }
    if (parameter.kind !== expectedKind) {
      throw new Error(`The parameter "${parameterLongName}" is of type "${CommandLineParameterKind[parameter.kind]}"`
        + ` whereas the caller was expecting "${CommandLineParameterKind[expectedKind]}".`);
    }
    return parameter as T;
  }

  private _defineParameter(parameter: CommandLineParameter<any>): void {
    const names: string[] = [];
    if (parameter.shortName) {
      names.push(parameter.shortName);
    }
    names.push(parameter.longName);

    parameter._parserKey = this._generateKey();

    const argparseOptions: argparse.ArgumentOptions = {
      help: parameter.description,
      dest: parameter._parserKey,
      metavar: (parameter as CommandLineParameterWithArgument<any>).argumentName || undefined
    };

    switch (parameter.kind) {
      case CommandLineParameterKind.Choice:
        const choiceParameter: CommandLineChoiceParameter = parameter as CommandLineChoiceParameter;
        argparseOptions.choices = choiceParameter.alternatives as string[];
        argparseOptions.defaultValue = choiceParameter.defaultValue;
        break;
      case CommandLineParameterKind.Flag:
        argparseOptions.action = 'storeTrue';
        break;
      case CommandLineParameterKind.Integer:
        argparseOptions.type = 'int';
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
