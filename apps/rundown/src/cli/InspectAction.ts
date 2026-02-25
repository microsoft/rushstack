// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { BaseReportAction } from './BaseReportAction.ts';
import { Rundown } from '../Rundown.ts';

export class InspectAction extends BaseReportAction {
  private readonly _traceParameter: CommandLineFlagParameter;

  public constructor() {
    super({
      actionName: 'inspect',
      summary: 'Invoke a Node.js script and generate detailed diagnostic output',
      documentation:
        'Invoke a Node.js script and generate detailed diagnostic output.  This command is used' +
        ' to inspect performance regressions.'
    });

    this._traceParameter = this.defineFlagParameter({
      parameterLongName: '--trace-imports',
      parameterShortName: '-t',
      description: 'Reports the call chain for each module path, showing how it was imported'
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    const rundown: Rundown = new Rundown();
    await rundown.invokeAsync(
      this.scriptParameter.value,
      this.argsParameter.value,
      this.quietParameter.value,
      this.ignoreExitCodeParameter.value
    );
    rundown.writeInspectReport(this._traceParameter.value);
  }
}
