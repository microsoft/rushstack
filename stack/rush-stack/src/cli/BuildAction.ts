// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction } from  '@microsoft/ts-command-line';
import { RushStackCommandLine } from './RushStackCommandLine';
import { BasicTasks } from '../logic/BasicTasks';
import { BuildContext } from '../logic/BuildContext';

export class BuildAction extends CommandLineAction {
  public constructor(parser: RushStackCommandLine) {
    super({
      actionName: 'build',
      summary: 'Build the current project',
      documentation: ''
    });
  }

  protected onDefineParameters(): void { // override
    this.defineFlagParameter({
      parameterLongName: '--production',
      description: 'used for production builds'
    });
    this.defineFlagParameter({
      parameterLongName: '--no-color',
      description: ''
    });
  }

  protected onExecute(): Promise<void> { // override
    const buildContext: BuildContext = new BuildContext();

    BasicTasks.doClean(buildContext);
    BasicTasks.doBuild(buildContext);

    return Promise.resolve();
  }
}
