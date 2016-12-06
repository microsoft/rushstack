import {
  CommandLineParser,
  CommandLineAction,
  ICommandLineActionOptions,
  CommandLineFlagParameter
} from '@microsoft/ts-command-line';
import { IExecutable } from './IExecutable';

import { ITaskMap } from './index';

class CoreBuildCommandLineAction extends CommandLineAction {
  private _parser: CoreBuildCommandLineParser;
  private _executable: IExecutable;

  constructor(parser: CoreBuildCommandLineParser,
    actionVerb: string,
    executable: IExecutable,
    commandLine: ICommandLineActionOptions) {

    commandLine = commandLine || {} as ICommandLineActionOptions;
    commandLine.actionVerb = actionVerb;

    super(commandLine);
    this._parser = parser;
    this._executable = executable;
  }

  protected onDefineParameters(): void {
    /* iterate the individual tasks which are defined for this IExecutable */
    if (this._executable.onDefineParameters) {
      this._executable.onDefineParameters();
    }
  }

  protected onExecute(): void {
    /* do nothing, since gulp is handling the selection of which tasks to run */
  }
}

export class CoreBuildCommandLineParser extends CommandLineParser {
  protected _shipParameter: CommandLineFlagParameter;
  protected _tasksParameter: CommandLineFlagParameter;

  constructor(tasks: ITaskMap) {
    super({
      toolFilename: 'gulp',
      toolDescription: '!!!! TODO !!!!'
    });

    // Register all top-level tasks with ts-command-line
    Object.keys(tasks).forEach((key: string) => {
      this.addAction(
        new CoreBuildCommandLineAction(this,
          key,
          tasks[key].action,
          tasks[key].commandLine));
    });
  }

  protected onDefineParameters(): void {
    this._shipParameter = this.defineFlagParameter({
      parameterLongName: '--ship',
      parameterShortName: '-s',
      description: 'Build for production, including minifying scripts and doing localization'
    });

    this._tasksParameter = this.defineFlagParameter({
      parameterLongName: '--tasks',
      parameterShortName: '-T',
      description: 'Shows a list of all available tasks, for tools which integrate with gulp'
    });

    this.defineFlagParameter({
      parameterLongName: '--color',
      description: 'Ensure that colors are turned on, regardless of TTY type'
    });

    this.defineFlagParameter({
      parameterLongName: '--no-color',
      description: 'Ensure that colors are turned off'
    });
  }
}