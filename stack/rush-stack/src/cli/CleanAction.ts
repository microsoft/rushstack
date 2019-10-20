// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction } from  '@microsoft/ts-command-line';
import { RushStackCommandLine } from './RushStackCommandLine';
import { BasicTasks } from '../logic/BasicTasks';
import { BuildContext } from '../logic/BuildContext';

export class CleanAction extends CommandLineAction {
  public constructor(parser: RushStackCommandLine) {
    super({
      actionName: 'clean',
      summary: 'Delete all the intermediary files created during a build',
      documentation: ''
    });
  }

  protected onDefineParameters(): void { // override
  }

  protected onExecute(): Promise<void> { // override
    const buildContext: BuildContext = new BuildContext();

    BasicTasks.doClean(buildContext);

    return Promise.resolve();
  }
}
