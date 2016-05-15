/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as argparse from 'argparse';
import CommandLineParameterProvider, { ICommandLineParserData } from './CommandLineParameterProvider';

export interface ICommandLineActionOptions {
  /**
   * The name of the sub-command.  For example, if the tool is called "example",
   * then the verb "build" might be invoked as: "foo build -q --some-other-option"
   */
  actionVerb: string;

  /**
   * A quick summary that is shown on the main help page, which is displayed
   * by the command "foo --help"
   */
  summary: string;

  /**
   * A detailed description that is shown on the action help page, which is displayed
   * by the command "foo --help build", e.g. for actionVerb="build".
   */
  documentation: string;
}

/**
 * Represents a sub-command that is part of the CommandLineParser command line.
 * Applications should create subclasses of CommandLineAction corresponding to
 * each action that they want to expose.
 */
export abstract class CommandLineAction extends CommandLineParameterProvider {
  public options: ICommandLineActionOptions;

  constructor(options: ICommandLineActionOptions) {
    super();
    this.options = options;
  }

  public buildParser(actionsSubParser: argparse.SubParser): void {
    this.argumentParser = actionsSubParser.addParser(this.options.actionVerb, {
      help: this.options.summary,
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

  /**
   * Your subclass should implement this hook to perform the operation.
   */
  protected abstract onExecute(): void;
}

export default CommandLineAction;
