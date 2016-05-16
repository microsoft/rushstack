/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as argparse from 'argparse';
import { ICommandLineFlagDefinition, CommandLineFlagParameter } from './CommandLineParameter';

export interface ICommandLineParserData {
  action: string;
  [key: string]: any;
}

/**
 * This is the common base class for CommandLineAction and CommandLineParser
 * that provides functionality for defining command-line parameters.
 */
abstract class CommandLineParameterProvider {
  private static _keyCounter: number = 0;

  protected argumentParser: argparse.ArgumentParser;
  private _parameters: CommandLineFlagParameter[];

  constructor() {
    this._parameters = [];
  }

  /**
   * The child class should implement this hook to define its command-line parameters,
   * e.g. by calling defineFlagParameter().
   */
  protected abstract onDefineParameters(): void;

  /**
   * Defines a flag parameter.  See ICommandLineFlagDefinition for details.
   */
  protected defineFlagParameter(options: ICommandLineFlagDefinition): CommandLineFlagParameter {
    const names: string[] = [];
    if (options.parameterShortName) {
      names.push(options.parameterShortName);
    }
    names.push(options.parameterLongName);

    const result: CommandLineFlagParameter = new CommandLineFlagParameter();
    result.key = this._createKeyName();

    this.argumentParser.addArgument(names, {
      help: options.description,
      action: 'storeTrue',
      dest: result.key
    });

    this._parameters.push(result);

    return result;
  }

  protected processParsedData(data: ICommandLineParserData): void {
    // Fill in the values for the parameters
    for (const parameter of this._parameters) {
      parameter.value = data[parameter.key];
    }
  }

  private _createKeyName(): string {
    return 'key_' + (CommandLineParameterProvider._keyCounter++).toString();
  }
}

export default CommandLineParameterProvider;
