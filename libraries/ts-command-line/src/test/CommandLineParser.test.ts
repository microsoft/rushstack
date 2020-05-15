// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction } from '../providers/CommandLineAction';
import { CommandLineParser } from '../providers/CommandLineParser';
import { CommandLineFlagParameter } from '../parameters/CommandLineParameter';

class TestAction extends CommandLineAction {
  public done: boolean = false;
  private _flag: CommandLineFlagParameter;

  public constructor() {
    super({
      actionName: 'do:the-job',
      summary: 'does the job',
      documentation: 'a longer description'
    });
  }

  protected onExecute(): Promise<void> {
    expect(this._flag.value).toEqual(true);
    this.done = true;
    return Promise.resolve();
  }

  protected onDefineParameters(): void {
    this._flag = this.defineFlagParameter({
      parameterLongName: '--flag',
      description: 'The flag'
    });
  }
}

class TestCommandLine extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'example',
      toolDescription: 'An example project'
    });

    this.addAction(new TestAction());
  }

  protected onDefineParameters(): void {
    // no parameters
  }
}

describe('CommandLineParser', () => {

  it('executes an action', () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    return commandLineParser.execute(['do:the-job', '--flag']).then(() => {
      expect(commandLineParser.selectedAction).toBeDefined();
      expect(commandLineParser.selectedAction!.actionName).toEqual('do:the-job');

      const action: TestAction = commandLineParser.selectedAction as TestAction;
      expect(action.done).toBe(true);
    });
  });

});
