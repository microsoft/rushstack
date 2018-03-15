// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as argparse from 'argparse';
import { ICommandLineParserData } from './CommandLineParameter';
import CommandLineParameterProvider from './CommandLineParameterProvider';

/**
 * Options for the CommandLineAction constructor.
 * @public
 */
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
 *
 * @public
 */
export abstract class CommandLineAction extends CommandLineParameterProvider {
  /**
   * The options that were passed to the constructor.
   */
  public options: ICommandLineActionOptions;

  constructor(options: ICommandLineActionOptions) {
    super();
    this.options = options;
  }

  /**
   * This is called internally by CommandLineParser.addAction()
   * @internal
   */
  public _buildParser(actionsSubParser: argparse.SubParser): void {
    this._argumentParser = actionsSubParser.addParser(this.options.actionVerb, {
      help: this.options.summary,
      description: this.options.documentation
    });

    this.onDefineParameters();
  }

  /**
   * This is called internally by CommandLineParser.execute()
   * @internal
   */
  public _processParsedData(data: ICommandLineParserData): void {
    super._processParsedData(data);
  }

  /**
   * Invoked by CommandLineParser.onExecute().
   * @internal
   */
  public _execute(): Promise<void> {
    return this.onExecute();
  }

  /**
   * Your subclass should implement this hook to perform the operation.
   */
  protected abstract onExecute(): Promise<void>;
}

export default CommandLineAction;
