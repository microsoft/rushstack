// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser, CommandLineFlagParameter } from '@rushstack/ts-command-line';
import { PushAction } from './PushAction';
import { RunAction } from './RunAction';
import { BusinessLogic } from './BusinessLogic';

export class WidgetCommandLine extends CommandLineParser {
  private _verbose: CommandLineFlagParameter;

  public constructor() {
    super({
      toolFilename: 'widget',
      toolDescription: 'The "widget" tool is a code sample for using the @rushstack/ts-command-line library.',
    });

    this.addAction(new PushAction());
    this.addAction(new RunAction());
  }

  protected onDefineParameters(): void {
    // abstract
    this._verbose = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'Show extra logging detail',
    });
  }

  protected onExecute(): Promise<void> {
    // override
    BusinessLogic.configureLogger(this._verbose.value);
    return super.onExecute();
  }
}
