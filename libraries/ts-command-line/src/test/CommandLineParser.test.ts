// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction } from '../CommandLineAction';
import { CommandLineParser } from '../CommandLineParser';
import { CommandLineFlagParameter } from '../CommandLineParameter';

class TestAction extends CommandLineAction {
  public done: boolean = false;
  private _flag: CommandLineFlagParameter;

  public constructor() {
    super({
      actionVerb: 'do-job',
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
  }

  protected onDefineParameters(): void {
    // no parameters
  }
}

describe('CommandLineParser tests', () => {

  it('simple case', () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    const action: TestAction = new TestAction();
    commandLineParser.addAction(action);

    return commandLineParser.execute(['do-job', '--flag']).then(() => {
      expect(commandLineParser.selectedAction).toBeDefined();
      expect(action.done).toBe(true);
    });
  });

});
