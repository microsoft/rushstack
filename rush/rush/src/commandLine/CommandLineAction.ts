import * as argparse from 'argparse';
import CommandLineParameterProvider, { ICommandLineParserData } from './CommandLineParameterProvider';

export interface ICommandLineActionOptions {
  actionVerb: string;
  summary: string;
  documentation: string;
}

export abstract class CommandLineAction extends CommandLineParameterProvider {
  public options: ICommandLineActionOptions;

  constructor(options: ICommandLineActionOptions) {
    super();
    this.options = options;
  }

  public buildParser(actionsSubParser: argparse.SubParser): void {
    this.argumentParser = actionsSubParser.addParser(this.options.actionVerb, {
      // Quick summary shown on main help page
      help: this.options.summary,
      // Detailed description on subparser-specific help page
      description: this.options.documentation
    });

    this.onDefineParameters();
  }

  public processParsedData(data: ICommandLineParserData): void {
    super.processParsedData(data);
  }

  public execute(): void {
    this.onExecute();
  }

  protected abstract onExecute(): void;
}

export default CommandLineAction;
