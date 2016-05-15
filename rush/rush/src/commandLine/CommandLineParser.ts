import * as argparse from 'argparse';
import CommandLineAction from './CommandLineAction';
import CommandLineParameterProvider, { ICommandLineParserData } from './CommandLineParameterProvider';

export interface ICommandListParserOptions {
  // The name of your tool when invoked from the command line
  toolFilename: string;
  // General documentation that is included in the "--help" main page
  toolDescription: string;
}

abstract class CommandLineParser extends CommandLineParameterProvider {
  private _actionsSubParser: argparse.SubParser;

  private _options: ICommandListParserOptions;
  private _actions: CommandLineAction[];

  protected chosenAction: CommandLineAction;

  constructor(options: ICommandListParserOptions) {
    super();

    this._options = options;
    this._actions = [];

    this.argumentParser = new argparse.ArgumentParser({
      addHelp: true,
      prog: this._options.toolFilename,
      description: this._options.toolDescription,
      epilog: 'For help with individual actions, you can run:'
        + ` ${this._options.toolFilename} <command> -h`
    });

    this._actionsSubParser = this.argumentParser.addSubparsers({
      metavar: '<command>',
      dest: 'action'
    });

    this.onDefineParameters();
  }

  public addCommand(command: CommandLineAction): void {
    command.buildParser(this._actionsSubParser);
    this._actions.push(command);
  }

  public execute(args?: string[]): void {
    if (!args) {
      // 0=node.exe, 1=script name
      args = process.argv.slice(2);
    }

    const data: ICommandLineParserData = this.argumentParser.parseArgs();

    this.processParsedData(data);

    this

    for (const action of this._actions) {
      if (action.options.actionVerb === data.action) {
        this.chosenAction = action;
        action.processParsedData(data);
        break;
      }
    }
    if (!this.chosenAction) {
      throw Error('Unrecognized action');
    }

    this.onExecute();
  }

  protected onExecute(): void {
    this.chosenAction.execute();
  }
}
export default CommandLineParser;
