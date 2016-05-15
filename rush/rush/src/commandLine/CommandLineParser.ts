import * as argparse from 'argparse';
import CommandLineAction from './CommandLineAction';

export interface ICommandListParserOptions {
  // The name of your tool when invoked from the command line
  toolFilename: string;
  // General documentation that is included in the "--help" main page
  toolDescription: string;
}

export interface ICommandLineParserData {
  action: string;
  [key: string]: any;
}

abstract class CommandLineParser {
  private _parser: argparse.ArgumentParser;
  private _actionsSubParser: argparse.SubParser;

  private _options: ICommandListParserOptions;
  private _commands: CommandLineAction[];

  constructor(options: ICommandListParserOptions) {
    this._options = options;
    this._commands = [];

    this._parser = new argparse.ArgumentParser({
      addHelp: true,
      prog: this._options.toolFilename,
      description: this._options.toolDescription,
      epilog: 'For help with individual actions, you can run:'
        + ` ${this._options.toolFilename} <command> -h`
    });

    this._actionsSubParser = this._parser.addSubparsers({
      metavar: '<command>',
      dest: 'action'
    });
  }

  public addCommand(command: CommandLineAction): void {
    command.buildParser(this._actionsSubParser);
    this._commands.push(command);
  }

  public execute(args?: string[]): void {
    if (!args) {
      // 0=node.exe, 1=rush
      args = process.argv.slice(2);
    }

    const data: ICommandLineParserData = this._parser.parseArgs();

    this.onExecute();

    for (const command of this._commands) {
      if (command.options.commandVerb === data.action) {
        command.execute(data);
        return;
      }
    }

    throw Error('Unrecognized action');
  }

  protected onExecute(): void {
    // abstract
  }
}
export default CommandLineParser;
