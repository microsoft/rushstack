import * as argparse from 'argparse';
import * as os from 'os';
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
      + os.EOL + os.EOL + `${this._options.toolFilename} <command> -h`
    });

    this._actionsSubParser = this._parser.addSubparsers({
      metavar: "<command>",
      dest: "action"
    });
  }

  public addCommand(command: CommandLineAction) {
    command.buildParser(this._actionsSubParser);
    this._commands.push(command);
  }

  public execute(): void {
    const data: ICommandLineParserData = this._parser.parseArgs();
    console.log(JSON.stringify(data));

    for (const command of this._commands) {
      if (command.options.commandVerb === data.action) {
        command.execute(data);
        return;
      }
    }

    throw Error('Unrecognized action');
  }
}
export default CommandLineParser;
