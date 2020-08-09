// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BaseReportAction } from './BaseReportAction';

import { Rundown } from '../Rundown';
import { LauncherAction } from '../LauncherAction';

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

  protected onDefineParameters(): void {
    super.onDefineParameters();
  }

  protected async onExecute(): Promise<void> {
    Rundown.invoke(LauncherAction.Snapshot, this.scriptParameter.value!, this.argsParameter.values, false);
  }
}
