// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { BaseReportAction } from './BaseReportAction';
import { Rundown } from '../Rundown';
import { LauncherAction } from '../LauncherAction';

export class InspectAction extends BaseReportAction {
  private _traceParameter: CommandLineFlagParameter;

  public constructor() {
    super({
      actionName: 'inspect',
      summary: 'Invoke a Node.js script and generate detailed diagnostic output',
      documentation:
        'Invoke a Node.js script and generate detailed diagnostic output.  This command is used' +
        ' to inspect performance regressions.'
    });
  }

  protected onDefineParameters(): void {
    super.onDefineParameters();

    this._traceParameter = this.defineFlagParameter({
      parameterLongName: '--trace-imports',
      parameterShortName: '-t',
      description: 'Reports the call chain for each module path, showing how it was imported'
    });
  }

  protected async onExecute(): Promise<void> {
    Rundown.invoke(
      LauncherAction.Inspect,
      this.scriptParameter.value!,
      this.argsParameter.values,
      this._traceParameter.value!!
    );
  }
}
