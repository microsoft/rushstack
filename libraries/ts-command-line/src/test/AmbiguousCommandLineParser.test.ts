// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '../providers/CommandLineParser.ts';
import { CommandLineAction } from '../providers/CommandLineAction.ts';
import { AliasCommandLineAction } from '../providers/AliasCommandLineAction.ts';
import { ScopedCommandLineAction } from '../providers/ScopedCommandLineAction.ts';
import type { CommandLineStringParameter } from '../parameters/CommandLineStringParameter.ts';
import type { CommandLineFlagParameter } from '../parameters/CommandLineFlagParameter.ts';
import type { CommandLineParameterProvider } from '../providers/CommandLineParameterProvider.ts';
import { SCOPING_PARAMETER_GROUP } from '../Constants.ts';
import { ensureHelpTextMatchesSnapshot } from './helpTestUtilities.ts';

class GenericCommandLine extends CommandLineParser {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public constructor(actionType: new (...args: any[]) => CommandLineAction, ...args: any[]) {
    super({
      toolFilename: 'example',
      toolDescription: 'An example project'
    });

    this.addAction(new actionType(...args));
  }
}

class AmbiguousAction extends CommandLineAction {
  public done: boolean = false;
  private _short1Arg: CommandLineStringParameter;
  private _shortArg2: CommandLineStringParameter;
  private _scope1Arg: CommandLineStringParameter;
  private _scope2Arg: CommandLineStringParameter;
  private _nonConflictingArg: CommandLineStringParameter;

  public constructor() {
    super({
      actionName: 'do:the-job',
      summary: 'does the job',
      documentation: 'a longer description'
    });

    this._short1Arg = this.defineStringParameter({
      parameterLongName: '--short1',
      parameterShortName: '-s',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this._shortArg2 = this.defineStringParameter({
      parameterLongName: '--short2',
      parameterShortName: '-s',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this._scope1Arg = this.defineStringParameter({
      parameterLongName: '--arg',
      parameterScope: 'scope1',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this._scope2Arg = this.defineStringParameter({
      parameterLongName: '--arg',
      parameterScope: 'scope2',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this._nonConflictingArg = this.defineStringParameter({
      parameterLongName: '--non-conflicting-arg',
      parameterScope: 'scope',
      argumentName: 'ARG',
      description: 'The argument'
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    expect(this._short1Arg.value).toEqual('short1value');
    expect(this._shortArg2.value).toEqual('short2value');
    expect(this._scope1Arg.value).toEqual('scope1value');
    expect(this._scope2Arg.value).toEqual('scope2value');
    expect(this._nonConflictingArg.value).toEqual('nonconflictingvalue');
    this.done = true;
  }
}

class AbbreviationAction extends CommandLineAction {
  public done: boolean = false;
  public abbreviationFlag: CommandLineFlagParameter;

  public constructor() {
    super({
      actionName: 'do:the-job',
      summary: 'does the job',
      documentation: 'a longer description'
    });

    this.abbreviationFlag = this.defineFlagParameter({
      parameterLongName: '--abbreviation-flag',
      description: 'The argument'
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    this.done = true;
  }
}

class AliasAction extends AliasCommandLineAction {
  public constructor(targetActionClass: new () => CommandLineAction) {
    super({
      toolFilename: 'example',
      aliasName: 'do:the-job-alias',
      targetAction: new targetActionClass()
    });
  }
}

class AmbiguousScopedAction extends ScopedCommandLineAction {
  public done: boolean = false;
  public short1Value: string | undefined;
  public short2Value: string | undefined;
  public scope1Value: string | undefined;
  public scope2Value: string | undefined;
  public nonConflictingValue: string | undefined;
  private _scopingArg: CommandLineFlagParameter | undefined;
  private _short1Arg: CommandLineStringParameter | undefined;
  private _short2Arg: CommandLineStringParameter | undefined;
  private _scope1Arg: CommandLineStringParameter | undefined;
  private _scope2Arg: CommandLineStringParameter | undefined;
  private _nonConflictingArg: CommandLineStringParameter | undefined;

  public constructor() {
    super({
      actionName: 'scoped-action',
      summary: 'does the scoped action',
      documentation: 'a longer description'
    });

    // At least one scoping parameter is required to be defined on a scoped action
    this._scopingArg = this.defineFlagParameter({
      parameterLongName: '--scoping',
      description: 'The scoping parameter',
      parameterGroup: SCOPING_PARAMETER_GROUP
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    expect(this._scopingArg?.value).toEqual(true);
    if (this._short1Arg?.value) {
      this.short1Value = this._short1Arg.value;
    }
    if (this._short2Arg?.value) {
      this.short2Value = this._short2Arg.value;
    }
    if (this._scope1Arg?.value) {
      this.scope1Value = this._scope1Arg.value;
    }
    if (this._scope2Arg?.value) {
      this.scope2Value = this._scope2Arg.value;
    }
    if (this._nonConflictingArg?.value) {
      this.nonConflictingValue = this._nonConflictingArg.value;
    }
    this.done = true;
  }

  protected onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void {
    this._short1Arg = scopedParameterProvider.defineStringParameter({
      parameterLongName: '--short1',
      parameterShortName: '-s',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this._short2Arg = scopedParameterProvider.defineStringParameter({
      parameterLongName: '--short2',
      parameterShortName: '-s',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this._scope1Arg = scopedParameterProvider.defineStringParameter({
      parameterLongName: '--arg',
      parameterShortName: '-a',
      parameterScope: 'scope1',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this._scope2Arg = scopedParameterProvider.defineStringParameter({
      parameterLongName: '--arg',
      parameterShortName: '-a',
      parameterScope: 'scope2',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this._nonConflictingArg = scopedParameterProvider.defineStringParameter({
      parameterLongName: '--non-conflicting-arg',
      parameterShortName: '-a',
      parameterScope: 'scope',
      argumentName: 'ARG',
      description: 'The argument'
    });
  }
}

interface IAbbreviationScopedActionOptions {
  includeUnscopedAbbreviationFlag: boolean;
  includeScopedAbbreviationFlag: boolean;
}

class AbbreviationScopedAction extends ScopedCommandLineAction {
  public done: boolean = false;
  public unscopedAbbreviationFlag: CommandLineFlagParameter | undefined;
  public scopedAbbreviationFlag: CommandLineFlagParameter | undefined;

  private readonly _scopingArg: CommandLineFlagParameter;
  private _includeScopedAbbreviationFlag: boolean;

  public constructor(options: IAbbreviationScopedActionOptions) {
    super({
      actionName: 'scoped-action',
      summary: 'does the scoped action',
      documentation: 'a longer description'
    });

    if (options?.includeUnscopedAbbreviationFlag) {
      this.unscopedAbbreviationFlag = this.defineFlagParameter({
        parameterLongName: '--abbreviation',
        description: 'A flag used to test abbreviation logic'
      });
    }

    this._includeScopedAbbreviationFlag = !!options?.includeScopedAbbreviationFlag;

    // At least one scoping parameter is required to be defined on a scoped action
    this._scopingArg = this.defineFlagParameter({
      parameterLongName: '--scoping',
      description: 'The scoping parameter',
      parameterGroup: SCOPING_PARAMETER_GROUP
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    expect(this._scopingArg.value).toEqual(true);
    this.done = true;
  }

  protected onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void {
    if (this._includeScopedAbbreviationFlag) {
      this.scopedAbbreviationFlag = scopedParameterProvider.defineFlagParameter({
        parameterLongName: '--abbreviation-flag',
        description: 'A flag used to test abbreviation logic'
      });
    }
  }
}

describe(`Ambiguous ${CommandLineParser.name}`, () => {
  it('renders help text', () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(
      AmbiguousAction,
      AbbreviationAction,
      AliasAction,
      AmbiguousScopedAction,
      AbbreviationScopedAction
    );
    ensureHelpTextMatchesSnapshot(commandLineParser);
  });

  it('fails to execute when an ambiguous short name is provided', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AmbiguousAction);

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job', '-s'])
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('can execute the non-ambiguous scoped long names', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AmbiguousAction);

    await commandLineParser.executeAsync([
      'do:the-job',
      '--short1',
      'short1value',
      '--short2',
      'short2value',
      '--scope1:arg',
      'scope1value',
      '--scope2:arg',
      'scope2value',
      '--non-conflicting-arg',
      'nonconflictingvalue'
    ]);
    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('do:the-job');

    const action: AmbiguousAction = commandLineParser.selectedAction as AmbiguousAction;
    expect(action.done).toBe(true);

    expect(action.renderHelpText()).toMatchSnapshot();
    expect(action.getParameterStringMap()).toMatchSnapshot();
  });

  it('fails to execute when an ambiguous long name is provided', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AmbiguousAction);

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job', '--arg', 'test'])
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('fails when providing a flag to an action that was also declared in the tool', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AbbreviationAction);
    commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation-flag',
      description: 'A flag used to test abbreviation logic'
    });

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job', '--abbreviation-flag'])
    ).rejects.toThrowError(/Ambiguous option: "--abbreviation-flag"/);
  });

  it('fails when providing an exact match to an ambiguous abbreviation between flags on the tool and the action', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AbbreviationAction);
    commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation',
      description: 'A flag used to test abbreviation logic'
    });

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job', '--abbreviation'])
    ).rejects.toThrowError(/Ambiguous option: "--abbreviation"/);
  });

  it('fails when providing an ambiguous abbreviation between flags on the tool and the action', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AbbreviationAction);
    commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation',
      description: 'A flag used to test abbreviation logic'
    });

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job', '--abbrev'])
    ).rejects.toThrowError(/Ambiguous option: "--abbrev" could match --abbreviation-flag, --abbreviation/);
  });

  it('allows unambiguous abbreviation between flags on the tool and the action', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AbbreviationAction);
    const toolAbbreviationFlag: CommandLineFlagParameter = commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation',
      description: 'A flag used to test abbreviation logic'
    });

    await commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job', '--abbreviation-f']);

    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('do:the-job');

    const action: AbbreviationAction = commandLineParser.selectedAction as AbbreviationAction;
    expect(action.done).toBe(true);
    expect(action.abbreviationFlag.value).toBe(true);
    expect(toolAbbreviationFlag.value).toBe(false);
  });
});

describe(`Ambiguous aliased ${CommandLineParser.name}`, () => {
  it('fails to execute when an ambiguous short name is provided', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AliasAction, AmbiguousAction);
    commandLineParser.addAction(
      (commandLineParser.getAction('do:the-job-alias')! as AliasAction).targetAction
    );

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job-alias', '-s'])
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('can execute the non-ambiguous scoped long names', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AliasAction, AmbiguousAction);
    commandLineParser.addAction(
      (commandLineParser.getAction('do:the-job-alias')! as AliasAction).targetAction
    );

    await commandLineParser.executeAsync([
      'do:the-job-alias',
      '--short1',
      'short1value',
      '--short2',
      'short2value',
      '--scope1:arg',
      'scope1value',
      '--scope2:arg',
      'scope2value',
      '--non-conflicting-arg',
      'nonconflictingvalue'
    ]);
    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('do:the-job-alias');

    const action: AmbiguousAction = (commandLineParser.selectedAction as AliasAction)
      .targetAction as AmbiguousAction;
    expect(action.done).toBe(true);

    expect(action.renderHelpText()).toMatchSnapshot();
    expect(action.getParameterStringMap()).toMatchSnapshot();
  });

  it('fails to execute when an ambiguous long name is provided', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AliasAction, AmbiguousAction);
    commandLineParser.addAction(
      (commandLineParser.getAction('do:the-job-alias')! as AliasAction).targetAction
    );

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job-alias', '--arg', 'test'])
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('fails when providing a flag to an action that was also declared in the tool', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AliasAction, AbbreviationAction);
    commandLineParser.addAction(
      (commandLineParser.getAction('do:the-job-alias')! as AliasAction).targetAction
    );
    commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation-flag',
      description: 'A flag used to test abbreviation logic'
    });

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job-alias', '--abbreviation-flag'])
    ).rejects.toThrowError(/Ambiguous option: "--abbreviation-flag"/);
  });

  it('fails when providing an exact match to an ambiguous abbreviation between flags on the tool and the action', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AliasAction, AbbreviationAction);
    commandLineParser.addAction(
      (commandLineParser.getAction('do:the-job-alias')! as AliasAction).targetAction
    );
    commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation',
      description: 'A flag used to test abbreviation logic'
    });

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job-alias', '--abbreviation'])
    ).rejects.toThrowError(/Ambiguous option: "--abbreviation"/);
  });

  it('fails when providing an ambiguous abbreviation between flags on the tool and the action', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AliasAction, AbbreviationAction);
    commandLineParser.addAction(
      (commandLineParser.getAction('do:the-job-alias')! as AliasAction).targetAction
    );
    commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation',
      description: 'A flag used to test abbreviation logic'
    });

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job-alias', '--abbrev'])
    ).rejects.toThrowError(/Ambiguous option: "--abbrev" could match --abbreviation-flag, --abbreviation/);
  });

  it('allows unambiguous abbreviation between flags on the tool and the action', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AliasAction, AbbreviationAction);
    commandLineParser.addAction(
      (commandLineParser.getAction('do:the-job-alias')! as AliasAction).targetAction
    );
    const toolAbbreviationFlag: CommandLineFlagParameter = commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation',
      description: 'A flag used to test abbreviation logic'
    });

    await commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job-alias', '--abbreviation-f']);

    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('do:the-job-alias');

    const action: AbbreviationAction = (commandLineParser.selectedAction as AliasAction)
      .targetAction as AbbreviationAction;
    expect(action.done).toBe(true);
    expect(action.abbreviationFlag.value).toBe(true);
    expect(toolAbbreviationFlag.value).toBe(false);
  });
});

describe(`Ambiguous scoping ${CommandLineParser.name}`, () => {
  it('fails to execute when an ambiguous short name is provided to a scoping action', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AmbiguousScopedAction);

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['scoped-action', '--scoping', '--', '-s'])
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('fails to execute when an ambiguous short name is provided to a scoping action with a matching ambiguous long name', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AmbiguousScopedAction);

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['scoped-action', '--scoping', '--', '-a'])
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('can execute the non-ambiguous scoped long names on the scoping action', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AmbiguousScopedAction);

    await commandLineParser.executeAsync([
      'scoped-action',
      '--scoping',
      '--',
      '--short1',
      'short1value',
      '--short2',
      'short2value',
      '--scope1:arg',
      'scope1value',
      '--scope2:arg',
      'scope2value',
      '--non-conflicting-arg',
      'nonconflictingvalue'
    ]);
    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('scoped-action');

    const action: AmbiguousScopedAction = commandLineParser.selectedAction as AmbiguousScopedAction;
    expect(action.done).toBe(true);
    expect(action.short1Value).toEqual('short1value');
    expect(action.short2Value).toEqual('short2value');
    expect(action.scope1Value).toEqual('scope1value');
    expect(action.scope2Value).toEqual('scope2value');
    expect(action.nonConflictingValue).toEqual('nonconflictingvalue');
  });

  it('fails to execute when an ambiguous long name is provided to a scoping action', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AmbiguousScopedAction);

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync([
        'scoped-action',
        '--scoping',
        '--',
        '--arg',
        'test'
      ])
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('fails when providing an exact match to an ambiguous abbreviation between flags on the tool and the scoped action', async () => {
    const actionOptions: IAbbreviationScopedActionOptions = {
      includeUnscopedAbbreviationFlag: false,
      includeScopedAbbreviationFlag: true
    };
    const commandLineParser: GenericCommandLine = new GenericCommandLine(
      AbbreviationScopedAction,
      actionOptions
    );
    commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation',
      description: 'A flag used to test abbreviation logic'
    });

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync([
        'scoped-action',
        '--scoping',
        '--',
        '--abbreviation'
      ])
    ).rejects.toThrowError(/Ambiguous option: "--abbreviation"/);
  });

  it('fails when providing an exact match to an ambiguous abbreviation between flags on the scoped action and the unscoped action', async () => {
    const actionOptions: IAbbreviationScopedActionOptions = {
      includeUnscopedAbbreviationFlag: true,
      includeScopedAbbreviationFlag: true
    };
    const commandLineParser: GenericCommandLine = new GenericCommandLine(
      AbbreviationScopedAction,
      actionOptions
    );

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync([
        'scoped-action',
        '--scoping',
        '--',
        '--abbreviation'
      ])
    ).rejects.toThrowError(/Ambiguous option: "--abbreviation"/);
  });

  it('fails when providing an ambiguous abbreviation between flags on the tool and the scoped action', async () => {
    const actionOptions: IAbbreviationScopedActionOptions = {
      includeUnscopedAbbreviationFlag: false,
      includeScopedAbbreviationFlag: true
    };
    const commandLineParser: GenericCommandLine = new GenericCommandLine(
      AbbreviationScopedAction,
      actionOptions
    );
    commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation',
      description: 'A flag used to test abbreviation logic'
    });

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['scoped-action', '--scoping', '--', '--abbrev'])
    ).rejects.toThrowError(/Ambiguous option: "--abbrev" could match --abbreviation-flag, --abbreviation/);
  });

  it('fails when providing an ambiguous abbreviation between flags on the unscoped action and the scoped action', async () => {
    const actionOptions: IAbbreviationScopedActionOptions = {
      includeUnscopedAbbreviationFlag: true,
      includeScopedAbbreviationFlag: true
    };
    const commandLineParser: GenericCommandLine = new GenericCommandLine(
      AbbreviationScopedAction,
      actionOptions
    );

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['scoped-action', '--scoping', '--', '--abbrev'])
    ).rejects.toThrowError(/Ambiguous option: "--abbrev" could match --abbreviation-flag, --abbreviation/);
  });

  it('allows unambiguous abbreviation between flags on the tool and the scoped action', async () => {
    const actionOptions: IAbbreviationScopedActionOptions = {
      includeUnscopedAbbreviationFlag: false,
      includeScopedAbbreviationFlag: true
    };
    const commandLineParser: GenericCommandLine = new GenericCommandLine(
      AbbreviationScopedAction,
      actionOptions
    );
    const toolAbbreviationFlag: CommandLineFlagParameter = commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation',
      description: 'A flag used to test abbreviation logic'
    });
    const targetAction: AbbreviationScopedAction = commandLineParser.getAction(
      'scoped-action'
    ) as AbbreviationScopedAction;

    await commandLineParser.executeWithoutErrorHandlingAsync([
      'scoped-action',
      '--scoping',
      '--',
      '--abbreviation-f'
    ]);

    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('scoped-action');
    expect(targetAction.done).toBe(true);
    expect(targetAction.scopedAbbreviationFlag?.value).toBe(true);
    expect(toolAbbreviationFlag.value).toBe(false);
  });

  it('allows unambiguous abbreviation between flags on the unscoped action and the scoped action', async () => {
    const actionOptions: IAbbreviationScopedActionOptions = {
      includeUnscopedAbbreviationFlag: true,
      includeScopedAbbreviationFlag: true
    };
    const commandLineParser: GenericCommandLine = new GenericCommandLine(
      AbbreviationScopedAction,
      actionOptions
    );
    const targetAction: AbbreviationScopedAction = commandLineParser.getAction(
      'scoped-action'
    ) as AbbreviationScopedAction;

    await commandLineParser.executeWithoutErrorHandlingAsync([
      'scoped-action',
      '--scoping',
      '--',
      '--abbreviation-f'
    ]);

    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('scoped-action');
    expect(targetAction.done).toBe(true);
    expect(targetAction.scopedAbbreviationFlag?.value).toBe(true);
    expect(targetAction.unscopedAbbreviationFlag?.value).toBe(false);
  });
});
