// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';

import { ScopedCommandLineAction } from '../providers/ScopedCommandLineAction';
import { CommandLineStringParameter } from '../parameters/CommandLineStringParameter';
import { CommandLineParser } from '../providers/CommandLineParser';
import { CommandLineParameterProvider } from '../providers/CommandLineParameterProvider';

class TestScopedAction extends ScopedCommandLineAction {
  public done: boolean = false;
  public scopedValue: string | undefined;
  private _scopeArg!: CommandLineStringParameter;
  private _scopedArg!: CommandLineStringParameter;

  public constructor() {
    super({
      actionName: 'scoped-action',
      summary: 'does the scoped action',
      documentation: 'a longer description'
    });
  }

  protected async onExecute(): Promise<void> {
    expect(this._scopedArg.longName).toBe(`--scoped-${this._scopeArg.value}`);
    this.scopedValue = this._scopedArg.value;
    this.done = true;
  }

  protected onDefineUnscopedParameters(): void {
    this._scopeArg = this.defineStringParameter({
      parameterLongName: '--scope',
      parameterGroupName: ScopedCommandLineAction.ScopingParameterGroupName,
      argumentName: 'SCOPE',
      description: 'The scope'
    });
  }

  protected onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void {
    this._scopedArg = scopedParameterProvider.defineStringParameter({
      parameterLongName: `--scoped-${this._scopeArg.value}`,
      argumentName: 'SCOPED',
      description: 'The scoped argument.'
    });
  }
}

class TestCommandLine extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'example',
      toolDescription: 'An example project'
    });

    this.addAction(new TestScopedAction());
  }

  protected onDefineParameters(): void {
    // no parameters
  }
}

describe(CommandLineParser.name, () => {
  it('throws on unknown scoped arg', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    const args: string[] = ['scoped-action', '--scope', 'foo', '--', '--scoped-bar', 'baz'];

    return expect(commandLineParser.executeWithoutErrorHandling(args)).rejects.toThrowErrorMatchingSnapshot();
  });

  it('throws on missing positional arg divider with unknown positional args', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    const args: string[] = ['scoped-action', '--scope', 'foo', 'bar'];

    return expect(commandLineParser.executeWithoutErrorHandling(args)).rejects.toThrowErrorMatchingSnapshot();
  });

  it('executes a scoped action', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    await commandLineParser.execute(['scoped-action', '--scope', 'foo', '--', '--scoped-foo', 'bar']);

    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('scoped-action');

    const action: TestScopedAction = commandLineParser.selectedAction as TestScopedAction;
    expect(action.done).toBe(true);
    expect(action.scopedValue).toBe('bar');
  });

  it('prints the action help', () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    const helpText: string = colors.stripColors(
      commandLineParser.getAction('scoped-action').renderHelpText()
    );
    expect(helpText).toMatchSnapshot();
  });

  it('prints the scoped action help', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    // Execute the parser in order to populate the scoped action
    await commandLineParser.execute(['scoped-action', '--scope', 'foo', '--', '--scoped-foo', 'bar']);
    const unscopedAction: TestScopedAction & { _getScopedCommandLineParser(): CommandLineParser } =
      commandLineParser.getAction('scoped-action') as TestScopedAction & {
        _getScopedCommandLineParser(): CommandLineParser;
      };
    const scopedCommandLineParser: CommandLineParser = unscopedAction._getScopedCommandLineParser();
    const helpText: string = colors.stripColors(scopedCommandLineParser.renderHelpText());
    expect(helpText).toMatchSnapshot();
  });
});
