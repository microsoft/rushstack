// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction } from '../providers/CommandLineAction';
import { CommandLineStringParameter } from '../parameters/CommandLineStringParameter';
import { CommandLineParser } from '../providers/CommandLineParser';
import { IScopedLongNameParseResult } from '../providers/CommandLineParameterProvider';

class TestAction extends CommandLineAction {
  public done: boolean = false;
  private _scope1Arg!: CommandLineStringParameter;
  private _scope2Arg!: CommandLineStringParameter;
  private _nonConflictingArg!: CommandLineStringParameter;

  public constructor() {
    super({
      actionName: 'do:the-job',
      summary: 'does the job',
      documentation: 'a longer description'
    });
  }

  protected async onExecute(): Promise<void> {
    expect(this._scope1Arg.value).toEqual('scope1value');
    expect(this._scope2Arg.value).toEqual('scope2value');
    expect(this._nonConflictingArg.value).toEqual('nonconflictingvalue');
    this.done = true;
  }

  protected onDefineParameters(): void {
    // Used to validate that conflicting parameters with different scopes return different values
    this._scope1Arg = this.defineStringParameter({
      parameterLongName: '--arg',
      parameterScope: 'scope1',
      argumentName: 'ARG',
      description: 'The argument'
    });
    // Used to validate that conflicting parameters with different scopes return different values
    this._scope2Arg = this.defineStringParameter({
      parameterLongName: '--arg',
      parameterScope: 'scope2',
      argumentName: 'ARG',
      description: 'The argument'
    });
    // Used to validate that non-conflicting args can be reference by both the unscoped and the
    // scoped parameter names
    this._nonConflictingArg = this.defineStringParameter({
      parameterLongName: '--non-conflicting-arg',
      parameterScope: 'scope3',
      argumentName: 'ARG',
      description: 'The argument'
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

describe(`Conflicting ${CommandLineParser.name}`, () => {
  it('executes an action', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    await commandLineParser.execute([
      'do:the-job',
      '--scope1:arg',
      'scope1value',
      '--scope2:arg',
      'scope2value',
      '--non-conflicting-arg',
      'nonconflictingvalue'
    ]);

    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('do:the-job');

    const action: TestAction = commandLineParser.selectedAction as TestAction;
    expect(action.done).toBe(true);

    expect(action.renderHelpText()).toMatchSnapshot();
    expect(action.getParameterStringMap()).toMatchSnapshot();
  });

  it('parses the scope out of a long name correctly', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    let result: IScopedLongNameParseResult = commandLineParser.parseScopedLongName('--scope1:arg');
    expect(result.scope).toEqual('scope1');
    expect(result.longName).toEqual('arg');

    result = commandLineParser.parseScopedLongName('--arg');
    expect(result.scope).toBeUndefined();
    expect(result.longName).toEqual('arg');

    result = commandLineParser.parseScopedLongName('--my-scope:my-arg');
    expect(result.scope).toEqual('my-scope');
    expect(result.longName).toEqual('my-arg');
  });
});
