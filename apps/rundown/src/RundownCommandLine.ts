// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineParser,
  CommandLineFlagParameter,
  CommandLineStringParameter
} from '@rushstack/ts-command-line';

import { Rundown } from './Rundown';

export class RundownCommandLine extends CommandLineParser {
  private _scriptParameter: CommandLineStringParameter;
  private _traceParameter: CommandLineFlagParameter;
  private _argsParameter: CommandLineStringParameter;

  public constructor() {
    super({
      toolFilename: 'rundown',
      toolDescription:
        'Detect load time regressions by running an app, tracing require() calls,' +
        ' and generating a deterministic report'
    });
  }

  protected onDefineParameters(): void {
    // abstract
    this._scriptParameter = this.defineStringParameter({
      parameterLongName: '--script',
      parameterShortName: '-s',
      argumentName: 'PATH',
      description: 'The path to a .js file that will be invoked as the process entry point',
      required: true
    });
    this._traceParameter = this.defineFlagParameter({
      parameterLongName: '--trace',
      parameterShortName: '-t',
      description: 'Report lots of extra information that is useful for investigating problems'
    });
    this._argsParameter = this.defineStringParameter({
      parameterLongName: '--args',
      argumentName: 'STRING',
      description: 'A text string containing the command-line arguments to be passed to the Node.js process'
    });
  }

  protected onExecute(): Promise<void> {
    Rundown.invoke(
      this._scriptParameter.value!,
      this._traceParameter.value!!,
      this._argsParameter.value || ''
    );
    return super.onExecute();
  }
}
