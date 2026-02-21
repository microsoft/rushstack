// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BaseReportAction } from './BaseReportAction.ts';
import { Rundown } from '../Rundown.ts';

export class SnapshotAction extends BaseReportAction {
  public constructor() {
    super({
      actionName: 'snapshot',
      summary: 'Invoke a Node.js script and generate a test snapshot',
      documentation:
        'Invoke a Node.js script and generate a test snapshot.  This command creates a concise report that can be' +
        ' added to Git, so that its diff can be used to detect performance regressions'
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
    rundown.writeSnapshotReport();
  }
}
