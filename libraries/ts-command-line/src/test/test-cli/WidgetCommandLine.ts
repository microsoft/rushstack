// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser, type CommandLineFlagParameter } from '../../index.ts';

import { PushAction } from './PushAction.ts';
import { RunAction } from './RunAction.ts';
import { BusinessLogic } from './BusinessLogic.ts';

export class WidgetCommandLine extends CommandLineParser {
  private readonly _verbose: CommandLineFlagParameter;

  public constructor() {
    super({
      toolFilename: 'widget',
      toolDescription: 'The "widget" tool is a code sample for using the @rushstack/ts-command-line library.'
    });

    this.addAction(new PushAction());
    this.addAction(new RunAction());

    this._verbose = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'Show extra logging detail'
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    BusinessLogic.configureLogger(this._verbose.value);
    return await super.onExecuteAsync();
  }
}
