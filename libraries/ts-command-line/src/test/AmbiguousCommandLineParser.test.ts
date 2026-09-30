// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '../providers/CommandLineParser';
import { CommandLineAction } from '../providers/CommandLineAction';
import { AliasCommandLineAction } from '../providers/AliasCommandLineAction';
import { ScopedCommandLineAction } from '../providers/ScopedCommandLineAction';
import type { CommandLineStringParameter } from '../parameters/CommandLineStringParameter';
import type { CommandLineFlagParameter } from '../parameters/CommandLineFlagParameter';
import type { CommandLineParameterProvider } from '../providers/CommandLineParameterProvider';
import { SCOPING_PARAMETER_GROUP } from '../Constants';
import { ensureHelpTextMatchesSnapshot } from './helpTestUtilities';

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
  #short1Arg: CommandLineStringParameter;
  #shortArg2: CommandLineStringParameter;
  #scope1Arg: CommandLineStringParameter;
  #scope2Arg: CommandLineStringParameter;
  #nonConflictingArg: CommandLineStringParameter;

  public constructor() {
    super({
      actionName: 'do:the-job',
      summary: 'does the job',
      documentation: 'a longer description'
    });

    this.#short1Arg = this.defineStringParameter({
      parameterLongName: '--short1',
      parameterShortName: '-s',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this.#shortArg2 = this.defineStringParameter({
      parameterLongName: '--short2',
      parameterShortName: '-s',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this.#scope1Arg = this.defineStringParameter({
      parameterLongName: '--arg',
      parameterScope: 'scope1',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this.#scope2Arg = this.defineStringParameter({
      parameterLongName: '--arg',
      parameterScope: 'scope2',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this.#nonConflictingArg = this.defineStringParameter({
      parameterLongName: '--non-conflicting-arg',
      parameterScope: 'scope',
      argumentName: 'ARG',
      description: 'The argument'
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    expect(this.#short1Arg.value).toEqual('short1value');
    expect(this.#shortArg2.value).toEqual('short2value');
    expect(this.#scope1Arg.value).toEqual('scope1value');
    expect(this.#scope2Arg.value).toEqual('scope2value');
    expect(this.#nonConflictingArg.value).toEqual('nonconflictingvalue');
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

class ShortNameAction extends CommandLineAction {
  public done: boolean = false;
  public deleteFlag: CommandLineFlagParameter;

  public constructor() {
    super({
      actionName: 'do:the-job',
      summary: 'does the job',
      documentation: 'a longer description'
    });

    this.deleteFlag = this.defineFlagParameter({
      parameterLongName: '--delete',
      parameterShortName: '-d',
      description: 'A flag whose short name the tool also declares'
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    this.done = true;
  }
}

function defineToolDebugFlag(commandLineParser: CommandLineParser): CommandLineFlagParameter {
  return commandLineParser.defineFlagParameter({
    parameterLongName: '--debug',
    parameterShortName: '-d',
    description: 'A flag whose short name the action also declares'
  });
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
  #scopingArg: CommandLineFlagParameter | undefined;
  #short1Arg: CommandLineStringParameter | undefined;
  #short2Arg: CommandLineStringParameter | undefined;
  #scope1Arg: CommandLineStringParameter | undefined;
  #scope2Arg: CommandLineStringParameter | undefined;
  #nonConflictingArg: CommandLineStringParameter | undefined;

  public constructor() {
    super({
      actionName: 'scoped-action',
      summary: 'does the scoped action',
      documentation: 'a longer description'
    });

    // At least one scoping parameter is required to be defined on a scoped action
    this.#scopingArg = this.defineFlagParameter({
      parameterLongName: '--scoping',
      description: 'The scoping parameter',
      parameterGroup: SCOPING_PARAMETER_GROUP
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    expect(this.#scopingArg?.value).toEqual(true);
    if (this.#short1Arg?.value) {
      this.short1Value = this.#short1Arg.value;
    }
    if (this.#short2Arg?.value) {
      this.short2Value = this.#short2Arg.value;
    }
    if (this.#scope1Arg?.value) {
      this.scope1Value = this.#scope1Arg.value;
    }
    if (this.#scope2Arg?.value) {
      this.scope2Value = this.#scope2Arg.value;
    }
    if (this.#nonConflictingArg?.value) {
      this.nonConflictingValue = this.#nonConflictingArg.value;
    }
    this.done = true;
  }

  protected onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void {
    this.#short1Arg = scopedParameterProvider.defineStringParameter({
      parameterLongName: '--short1',
      parameterShortName: '-s',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this.#short2Arg = scopedParameterProvider.defineStringParameter({
      parameterLongName: '--short2',
      parameterShortName: '-s',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this.#scope1Arg = scopedParameterProvider.defineStringParameter({
      parameterLongName: '--arg',
      parameterShortName: '-a',
      parameterScope: 'scope1',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this.#scope2Arg = scopedParameterProvider.defineStringParameter({
      parameterLongName: '--arg',
      parameterShortName: '-a',
      parameterScope: 'scope2',
      argumentName: 'ARG',
      description: 'The argument'
    });
    this.#nonConflictingArg = scopedParameterProvider.defineStringParameter({
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

  readonly #scopingArg: CommandLineFlagParameter;
  #includeScopedAbbreviationFlag: boolean;

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

    this.#includeScopedAbbreviationFlag = !!options?.includeScopedAbbreviationFlag;

    // At least one scoping parameter is required to be defined on a scoped action
    this.#scopingArg = this.defineFlagParameter({
      parameterLongName: '--scoping',
      description: 'The scoping parameter',
      parameterGroup: SCOPING_PARAMETER_GROUP
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    expect(this.#scopingArg.value).toEqual(true);
    this.done = true;
  }

  protected onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void {
    if (this.#includeScopedAbbreviationFlag) {
      this.scopedAbbreviationFlag = scopedParameterProvider.defineFlagParameter({
        parameterLongName: '--abbreviation-flag',
        description: 'A flag used to test abbreviation logic'
      });
    }
  }
}

class ShortNameScopedAction extends ScopedCommandLineAction {
  public done: boolean = false;
  public deleteFlag: CommandLineFlagParameter | undefined;

  public constructor() {
    super({
      actionName: 'scoped-action',
      summary: 'does the scoped action',
      documentation: 'a longer description'
    });

    // At least one scoping parameter is required to be defined on a scoped action
    this.defineFlagParameter({
      parameterLongName: '--scoping',
      description: 'The scoping parameter',
      parameterGroup: SCOPING_PARAMETER_GROUP
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    this.done = true;
  }

  protected onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void {
    this.deleteFlag = scopedParameterProvider.defineFlagParameter({
      parameterLongName: '--delete',
      parameterShortName: '-d',
      description: 'A flag whose short name the tool also declares'
    });
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
    ).rejects.toThrow(/Ambiguous option: "--abbreviation-flag"/);
  });

  it('fails when providing an exact match to an ambiguous abbreviation between flags on the tool and the action', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AbbreviationAction);
    commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation',
      description: 'A flag used to test abbreviation logic'
    });

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job', '--abbreviation'])
    ).rejects.toThrow(/Ambiguous option: "--abbreviation"/);
  });

  it('fails when providing an ambiguous abbreviation between flags on the tool and the action', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AbbreviationAction);
    commandLineParser.defineFlagParameter({
      parameterLongName: '--abbreviation',
      description: 'A flag used to test abbreviation logic'
    });

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job', '--abbrev'])
    ).rejects.toThrow(/Ambiguous option: "--abbrev" could match --abbreviation-flag, --abbreviation/);
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

  it('can execute a parameter by its long name when the tool also declares its short name', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(ShortNameAction);
    const toolDebugFlag: CommandLineFlagParameter = defineToolDebugFlag(commandLineParser);

    await commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job', '--delete']);

    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('do:the-job');

    const action: ShortNameAction = commandLineParser.selectedAction as ShortNameAction;
    expect(action.done).toBe(true);
    expect(action.deleteFlag.value).toBe(true);
    expect(toolDebugFlag.value).toBe(false);

    // The action's help doesn't offer the short name, since it can't be used after the action name
    const helpText: string = action.renderHelpText();
    expect(helpText).toContain('  --delete ');
    expect(helpText).not.toContain('-d, --delete');
  });

  it('can use a short name declared in both the tool and the action before the action name', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(ShortNameAction);
    const toolDebugFlag: CommandLineFlagParameter = defineToolDebugFlag(commandLineParser);

    await commandLineParser.executeWithoutErrorHandlingAsync(['-d', 'do:the-job', '--delete']);

    const action: ShortNameAction = commandLineParser.selectedAction as ShortNameAction;
    expect(action.done).toBe(true);
    expect(action.deleteFlag.value).toBe(true);
    expect(toolDebugFlag.value).toBe(true);
  });

  it('fails when providing a short name to an action that was also declared in the tool', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(ShortNameAction);
    defineToolDebugFlag(commandLineParser);

    await expect(commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job', '-d'])).rejects.toThrow(
      'Error: example do:the-job: error: Ambiguous option: "-d".\n'
    );
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
    ).rejects.toThrow(/Ambiguous option: "--abbreviation-flag"/);
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
    ).rejects.toThrow(/Ambiguous option: "--abbreviation"/);
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
    ).rejects.toThrow(/Ambiguous option: "--abbrev" could match --abbreviation-flag, --abbreviation/);
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

  it('can execute a parameter by its long name when the tool also declares its short name', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AliasAction, ShortNameAction);
    commandLineParser.addAction(
      (commandLineParser.getAction('do:the-job-alias')! as AliasAction).targetAction
    );
    const toolDebugFlag: CommandLineFlagParameter = defineToolDebugFlag(commandLineParser);

    await commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job-alias', '--delete']);

    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('do:the-job-alias');

    const action: ShortNameAction = (commandLineParser.selectedAction as AliasAction)
      .targetAction as ShortNameAction;
    expect(action.done).toBe(true);
    expect(action.deleteFlag.value).toBe(true);
    expect(toolDebugFlag.value).toBe(false);
  });

  it('fails when providing a short name to an action that was also declared in the tool', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(AliasAction, ShortNameAction);
    commandLineParser.addAction(
      (commandLineParser.getAction('do:the-job-alias')! as AliasAction).targetAction
    );
    defineToolDebugFlag(commandLineParser);

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['do:the-job-alias', '-d'])
    ).rejects.toThrow('Error: example do:the-job-alias: error: Ambiguous option: "-d".\n');
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
    ).rejects.toThrow(/Ambiguous option: "--abbreviation"/);
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
    ).rejects.toThrow(/Ambiguous option: "--abbreviation"/);
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
    ).rejects.toThrow(/Ambiguous option: "--abbrev" could match --abbreviation-flag, --abbreviation/);
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
    ).rejects.toThrow(/Ambiguous option: "--abbrev" could match --abbreviation-flag, --abbreviation/);
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

  it('can execute a scoped parameter by its long name when the tool also declares its short name', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(ShortNameScopedAction);
    const toolDebugFlag: CommandLineFlagParameter = defineToolDebugFlag(commandLineParser);
    const targetAction: ShortNameScopedAction = commandLineParser.getAction(
      'scoped-action'
    ) as ShortNameScopedAction;

    await commandLineParser.executeWithoutErrorHandlingAsync([
      'scoped-action',
      '--scoping',
      '--',
      '--delete'
    ]);

    expect(commandLineParser.selectedAction).toBeDefined();
    expect(commandLineParser.selectedAction!.actionName).toEqual('scoped-action');
    expect(targetAction.done).toBe(true);
    expect(targetAction.deleteFlag?.value).toBe(true);
    expect(toolDebugFlag.value).toBe(false);
  });

  it('fails when providing a short name to a scoped action that was also declared in the tool', async () => {
    const commandLineParser: GenericCommandLine = new GenericCommandLine(ShortNameScopedAction);
    defineToolDebugFlag(commandLineParser);

    await expect(
      commandLineParser.executeWithoutErrorHandlingAsync(['scoped-action', '--scoping', '--', '-d'])
    ).rejects.toThrow('Error: example scoped-action --scoping --: error: Ambiguous option: "-d".\n');
  });
});
