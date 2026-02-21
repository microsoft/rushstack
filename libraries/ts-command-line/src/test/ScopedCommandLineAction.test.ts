// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiEscape } from '@rushstack/terminal';

import { ScopedCommandLineAction } from '../providers/ScopedCommandLineAction.ts';
import type { CommandLineStringParameter } from '../parameters/CommandLineStringParameter.ts';
import { CommandLineParser } from '../providers/CommandLineParser.ts';
import type { CommandLineParameterProvider } from '../providers/CommandLineParameterProvider.ts';
import type { CommandLineFlagParameter } from '../parameters/CommandLineFlagParameter.ts';
import { ensureHelpTextMatchesSnapshot } from './helpTestUtilities.ts';

class TestScopedAction extends ScopedCommandLineAction {
  public done: boolean = false;
  public scopedValue: string | undefined;
  private _verboseArg: CommandLineFlagParameter;
  private _scopeArg: CommandLineStringParameter;
  private _scopedArg: CommandLineStringParameter | undefined;

  public constructor() {
    super({
      actionName: 'scoped-action',
      summary: 'does the scoped action',
      documentation: 'a longer description'
    });

    this._verboseArg = this.defineFlagParameter({
      parameterLongName: '--verbose',
      description: 'A flag parameter.'
    });

    this._scopeArg = this.defineStringParameter({
      parameterLongName: '--scope',
      parameterGroup: ScopedCommandLineAction.ScopingParameterGroup,
      argumentName: 'SCOPE',
      description: 'The scope'
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    if (this._scopedArg) {
      expect(this._scopedArg.longName).toBe(`--scoped-${this._scopeArg.value}`);
      this.scopedValue = this._scopedArg.value;
    }
    this.done = true;
  }

  protected onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void {
    if (this._scopeArg.value) {
      this._scopedArg = scopedParameterProvider.defineStringParameter({
        parameterLongName: `--scoped-${this._scopeArg.value}`,
        argumentName: 'SCOPED',
        description: 'The scoped argument.'
      });
    }
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
}

describe(CommandLineParser.name, () => {
  it('renders help text', () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    ensureHelpTextMatchesSnapshot(commandLineParser);
  });

  it('throws on unknown scoped arg', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    const args: string[] = ['scoped-action', '--scope', 'foo', '--', '--scoped-bar', 'baz'];

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(args)
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('throws on missing positional arg divider with unknown positional args', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    const args: string[] = ['scoped-action', '--scope', 'foo', 'bar'];

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(args)
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('executes a scoped action', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();

    await commandLineParser.executeAsync(['scoped-action', '--scope', 'foo', '--', '--scoped-foo', 'bar']);

    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('scoped-action');

    const action: TestScopedAction = commandLineParser.selectedAction as TestScopedAction;
    expect(action.done).toBe(true);
    expect(action.scopedValue).toBe('bar');
  });

  it('prints the action help', () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    const helpText: string = AnsiEscape.removeCodes(
      commandLineParser.getAction('scoped-action').renderHelpText()
    );
    expect(helpText).toMatchSnapshot();
  });

  it('prints the scoped action help', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    // Execute the parser in order to populate the scoped action to populate the help text.
    await commandLineParser.executeAsync(['scoped-action', '--scope', 'foo', '--', '--scoped-foo', 'bar']);
    const scopedAction: TestScopedAction & { _getScopedCommandLineParser(): CommandLineParser } =
      commandLineParser.getAction('scoped-action') as TestScopedAction & {
        _getScopedCommandLineParser(): CommandLineParser;
      };
    const scopedCommandLineParser: CommandLineParser = scopedAction._getScopedCommandLineParser();
    const helpText: string = AnsiEscape.removeCodes(scopedCommandLineParser.renderHelpText());
    expect(helpText).toMatchSnapshot();
  });

  it('prints the unscoped action parameter map', async () => {
    const commandLineParser: TestCommandLine = new TestCommandLine();
    // Execute the parser in order to populate the scoped action
    await commandLineParser.executeAsync(['scoped-action', '--verbose']);
    const scopedAction: TestScopedAction = commandLineParser.getAction('scoped-action') as TestScopedAction;
    expect(scopedAction.done).toBe(true);
    expect(scopedAction.parameters.length).toBe(2);
    const parameterStringMap: Record<string, string> = scopedAction.getParameterStringMap();
    expect(parameterStringMap).toMatchSnapshot();
  });

  it('prints the scoped action parameter map', async () => {
    let commandLineParser: TestCommandLine = new TestCommandLine();
    // Execute the parser in order to populate the scoped action
    await commandLineParser.executeAsync(['scoped-action', '--scope', 'foo']);
    let scopedAction: TestScopedAction = commandLineParser.getAction('scoped-action') as TestScopedAction;
    expect(scopedAction.done).toBe(true);
    expect(scopedAction.parameters.length).toBe(3);
    let parameterStringMap: Record<string, string> = scopedAction.getParameterStringMap();
    expect(parameterStringMap).toMatchSnapshot();

    commandLineParser = new TestCommandLine();
    // Execute the parser in order to populate the scoped action
    await commandLineParser.executeAsync(['scoped-action', '--scope', 'foo', '--', '--scoped-foo', 'bar']);
    scopedAction = commandLineParser.getAction('scoped-action') as TestScopedAction;
    expect(scopedAction.done).toBe(true);
    expect(scopedAction.parameters.length).toBe(3);
    parameterStringMap = scopedAction.getParameterStringMap();
    expect(parameterStringMap).toMatchSnapshot();
  });
});
