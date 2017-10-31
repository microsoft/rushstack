// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as argparse from 'argparse';
import * as colors from 'colors';

import {
  IBaseCommandLineDefinition,
  ICommandLineFlagDefinition,
  ICommandLineStringDefinition,
  ICommandLineStringListDefinition,
  ICommandLineIntegerDefinition,
  ICommandLineOptionDefinition
} from './CommandLineDefinition';
import {
  CommandLineParameter,
  ICommandLineParserData,
  IConverterFunction,
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineStringListParameter,
  CommandLineIntegerParameter,
  CommandLineOptionParameter
} from './CommandLineParameter';

interface IParameterMetadata<TValue> {
  parameter: CommandLineParameter<TValue>;
  required: boolean;
  defaultValue: TValue | undefined;
}

/**
 * This is the common base class for CommandLineAction and CommandLineParser
 * that provides functionality for defining command-line parameters.
 *
 * @public
 */
abstract class CommandLineParameterProvider {
  private static _keyCounter: number = 0;

  protected argumentParser: argparse.ArgumentParser;
  /* tslint:disable:no-any */
  private _parameterMetadata: Map<string, IParameterMetadata<any>>;
  private _parameters: CommandLineParameter<any>[];
  /* tslint:enable:no-any */
  private _keys: Map<string, string>;

  constructor() {
    this._parameters = [];
    // tslint:disable-next-line:no-any
    this._parameterMetadata  = new Map<string, IParameterMetadata<any>>();
    this._keys = new Map<string, string>();
  }

  /**
   * The child class should implement this hook to define its command-line parameters,
   * e.g. by calling defineFlagParameter().
   */
  protected abstract onDefineParameters(): void;

  /**
   * Defines a flag parameter.  See ICommandLineFlagDefinition for details.
   */
  protected defineFlagParameter(definition: ICommandLineFlagDefinition): CommandLineFlagParameter {
    return this._createParameter(
      definition, { action: 'storeTrue' }
    ) as CommandLineFlagParameter;
  }

  /**
   * Defines a string parameter.
   */
  protected defineStringParameter(definition: ICommandLineStringDefinition): CommandLineStringParameter {
    return this._createParameter(definition, undefined, definition.key) as CommandLineStringParameter;
  }

  /**
   * Defines a list of string by specifying the flag multiple times.
   */
  protected defineStringListParameter(definition: ICommandLineStringListDefinition): CommandLineStringListParameter {
    return this._createParameter(
      definition,
      { action: 'append' },
      definition.key
    ) as CommandLineStringListParameter;
  }

  /**
   * Defines an integer parameter
   */
  protected defineIntegerParameter(definition: ICommandLineIntegerDefinition): CommandLineIntegerParameter {
    return this._createParameter(
      definition,
      { type: 'int' },
      definition.key
    ) as CommandLineIntegerParameter;
  }

  protected defineOptionParameter(definition: ICommandLineOptionDefinition): CommandLineOptionParameter {
    if (!definition.options) {
      throw new Error(`When defining an option parameter, the options array must be defined.`);
    }

    if (definition.defaultValue && definition.options.indexOf(definition.defaultValue) === -1) {
      throw new Error(`Could not find default value "${definition.defaultValue}" ` +
        `in the array of available options: ${definition.options.toString()}`);
    }

    return this._createParameter(definition, {
      choices: definition.options,
      defaultValue: definition.defaultValue
    }) as CommandLineOptionParameter;
  }

  protected processParsedData(data: ICommandLineParserData): void {
    // Fill in the values for the parameters
    for (const parameter of this._parameters) {
      parameter.setValue(data);
    }

    this._parameterMetadata.forEach((parameterMetadata: IParameterMetadata<any>) => { // tslint:disable-line:no-any
      if (parameterMetadata.parameter.value === undefined && parameterMetadata.defaultValue) {
        try {
          parameterMetadata.parameter.setValue({
            action: '',
            [parameterMetadata.parameter.key]: parameterMetadata.defaultValue
          });
        } catch (e) {
          /* do nothing */
        }
      }
    });
  }

  protected validateParameters(): boolean {
    const missingParameterLongNames: string[] = [];
    // tslint:disable-next-line:no-any
    this._parameterMetadata.forEach((parameterMetadata: IParameterMetadata<any>, parameterLongName: string) => {
      if (parameterMetadata.parameter.value === undefined && parameterMetadata.required) {
        missingParameterLongNames.push(parameterLongName);
      }
    });

    if (missingParameterLongNames.length > 0) {
      console.log(colors.red(`Missing required parameters: ${missingParameterLongNames.join(', ')}`));
      process.exit(1);
      return false;
    } else {
      return true;
    }
  }

  private _getKey(
    parameterLongName: string,
    key: string = 'key_' + (CommandLineParameterProvider._keyCounter++).toString()
  ): string {
    const existingKey: string | undefined = this._keys.get(key);
    if (existingKey) {
      throw colors.red(`The parameter "${parameterLongName}" tried to define a key which was already ` +
        `defined by the "${existingKey}" parameter. Ensure that the keys values are unique.`);
    }

    this._keys.set(key, parameterLongName);
    return key;
  }

  private _createParameter<TValue>(
    definition: IBaseCommandLineDefinition<TValue>,
    argparseOptions?: argparse.ArgumentOptions,
    key?: string,
    converter?: IConverterFunction<any> // tslint:disable-line:no-any
  ): CommandLineParameter<any> { // tslint:disable-line:no-any
    const names: string[] = [];
    if (definition.parameterShortName) {
      names.push(definition.parameterShortName);
    }

    names.push(definition.parameterLongName);

    const result: CommandLineParameter<any> = new CommandLineParameter<any>( // tslint:disable-line:no-any
      this._getKey(definition.parameterLongName, key),
      converter
    );

    this._parameters.push(result);

    const baseArgparseOptions: argparse.ArgumentOptions = {
      help: definition.description,
      dest: result.key
    };

    Object.keys(argparseOptions || {}).forEach((keyVal: string) => {
      baseArgparseOptions[keyVal] = (argparseOptions || {})[keyVal];
    });

    this.argumentParser.addArgument(names, baseArgparseOptions);

    this._parameterMetadata.set(
      definition.parameterLongName,
      {
        required: !!definition.required,
        parameter: result,
        defaultValue: definition.defaultValue
      }
    );

    return result;
  }
}

export default CommandLineParameterProvider;
