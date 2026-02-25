// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction } from '../providers/CommandLineAction.ts';
import type { CommandLineFlagParameter } from '../parameters/CommandLineFlagParameter.ts';
import { CommandLineParser } from '../providers/CommandLineParser.ts';
import { ensureHelpTextMatchesSnapshot } from './helpTestUtilities.ts';

class TestAction extends CommandLineAction {
  public done: boolean = false;
  private _flag: CommandLineFlagParameter;

  public constructor() {
    super({
      actionName: 'do:the-job',
      summary: 'does the job with sprintf-style escape characters, 100%',
      documentation: 'a longer description with sprintf-style escape characters, 100%'
    });

    this._flag = this.defineFlagParameter({
      parameterLongName: '--flag',
      description: 'The flag'
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    expect(this._flag.value).toEqual(true);
    this.done = true;
  }
}

class TestCommandLine extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'example',
      toolDescription: 'An example project with sprintf-style escape characters, 100%'
    });

    this.addAction(new TestAction());
  }
}

describe(CommandLineParser.name, () => {
  it('renders help text', () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    ensureHelpTextMatchesSnapshot(commandLineParser);
  });

  it('executes an action', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    commandLineParser._registerDefinedParameters({ parentParameterNames: new Set() });

    await commandLineParser.executeAsync(['do:the-job', '--flag']);

    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('do:the-job');

    const action: TestAction = commandLineParser.selectedAction as TestAction;
    expect(action.done).toBe(true);
  });

  it('can be instantiated directly without subclassing', () => {
    // This test verifies that CommandLineParser can be instantiated directly,
    // which is useful for test scenarios
    const commandLineParser = new CommandLineParser({
      toolFilename: 'test-tool',
      toolDescription: 'A test tool'
    });

    expect(commandLineParser).toBeDefined();
    expect(commandLineParser.actions).toEqual([]);

    // Verify that addAction can be called on the direct instance
    const action = new TestAction();
    commandLineParser.addAction(action);
    expect(commandLineParser.actions).toHaveLength(1);
    expect(commandLineParser.actions[0]).toBe(action);
  });
});
