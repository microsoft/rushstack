import * as argparse from 'argparse';
import { ICommandLineFlagDefinition, CommandLineFlag } from './CommandLineParameter';
import { ICommandLineParserData } from './CommandLineParser';

export interface ICommandLineActionOptions {
  commandVerb: string;
  summary: string;
  documentation: string;
}

export abstract class CommandLineAction {
  public options: ICommandLineActionOptions;

  private _argumentParser: argparse.ArgumentParser;

  private _parameters: CommandLineFlag[];

  constructor(options: ICommandLineActionOptions) {
    this.options = options;
    this._parameters = [];
  }

  public buildParser(actionsSubParser: argparse.SubParser): void {
    this._argumentParser = actionsSubParser.addParser(this.options.commandVerb, {
      // Quick summary shown on main help page
      help: this.options.summary,
      // Detailed description on subparser-specific help page
      description: this.options.documentation
    });

    this.onDefineOptions();
  }

  protected abstract onDefineOptions(): void;

  protected defineFlagParameter(options: ICommandLineFlagDefinition): CommandLineFlag {
    let names: string[] = [];
    if (options.parameterShortName) {
      names.push(options.parameterShortName);
    }
    names.push(options.parameterLongName);

    let result: CommandLineFlag = new CommandLineFlag();
    result.key = 'key_' + this._parameters.length;

    this._argumentParser.addArgument(names, {
      help: options.description,
      action: 'storeTrue',
      dest: result.key
    });

    this._parameters.push(result);

    return result;
  }

  public execute(data: ICommandLineParserData): void {
    // Fill in the values for the parameters
    for (const parameter of this._parameters) {
      parameter.value = data[parameter.key];
    }

    this.onExecute();
  }

  protected abstract onExecute(): void;
}

export default CommandLineAction;
