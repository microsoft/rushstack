import * as argparse from 'argparse';

export interface ICommandLineParserData {
  action: string;
  [key: string]: any;
}

export interface ICommandLineFlagDefinition {
  parameterLongName: string;
  parameterShortName?: string;
  description: string;
}

export class CommandLineFlagParameter {
  public key: string;
  public value: boolean;
}

abstract class CommandLineParameterProvider {
  static keyCounter: number = 0;

  private _parameters: CommandLineFlagParameter[];
  protected argumentParser: argparse.ArgumentParser;

  constructor() {
    this._parameters = [];
  }

  protected abstract onDefineParameters(): void;

  private _createKeyName(): string {
    return 'key_' + (CommandLineParameterProvider.keyCounter++).toString();
  }

  protected defineFlagParameter(options: ICommandLineFlagDefinition): CommandLineFlagParameter {
    let names: string[] = [];
    if (options.parameterShortName) {
      names.push(options.parameterShortName);
    }
    names.push(options.parameterLongName);

    let result: CommandLineFlagParameter = new CommandLineFlagParameter();
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
}

export default CommandLineParameterProvider;
