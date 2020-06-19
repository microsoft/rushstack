// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineAction,
  CommandLineFlagParameter,
  ICommandLineActionOptions
} from '@rushstack/ts-command-line';
import { Terminal, IPackageJson, Colors, ConsoleTerminalProvider } from '@rushstack/node-core-library';
import { AsyncSeriesBailHook, SyncHook, AsyncSeriesHook } from 'tapable';
import { performance } from 'perf_hooks';

import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { PluginManager } from '../../pluginFramework/PluginManager';

/**
 * @public
 */
export interface IActionDataBase<THooks extends ActionHooksBase> {
  hooks: THooks;
}

/**
 * @public
 */
export abstract class ActionHooksBase {
  /**
   * This hook allows the action's execution to be completely overridden. Only the last-registered plugin
   * with an override hook provided applies.
   */
  public readonly override: AsyncSeriesBailHook<IActionDataBase<ActionHooksBase>> = new AsyncSeriesBailHook([
    'actionData'
  ]);

  public readonly loadActionConfiguration: AsyncSeriesHook = new AsyncSeriesHook();

  public readonly afterLoadActionConfiguration: AsyncSeriesHook = new AsyncSeriesHook();
}

export interface IHeftActionBaseOptions {
  terminal: Terminal;
  heftConfiguration: HeftConfiguration;
  pluginManager: PluginManager;
}

export abstract class HeftActionBase<
  TActionData extends IActionDataBase<THooks>,
  THooks extends ActionHooksBase
> extends CommandLineAction {
  public /* readonly */ actionHook: SyncHook<TActionData & IActionDataBase<THooks>>;
  protected readonly terminal: Terminal;
  protected readonly heftConfiguration: HeftConfiguration;
  protected verboseFlag: CommandLineFlagParameter;
  protected _actionDataUpdaters: ((actionOptions: TActionData) => void)[] = [];
  private readonly _innerHooksType: new () => THooks;

  public constructor(
    commandLineOptions: ICommandLineActionOptions,
    heftActionOptions: IHeftActionBaseOptions,
    innerHooksType: new () => THooks
  ) {
    super(commandLineOptions);
    this.terminal = heftActionOptions.terminal;
    this.heftConfiguration = heftActionOptions.heftConfiguration;
    this.actionHook = new SyncHook<TActionData & IActionDataBase<THooks>>(['action']);
    this._innerHooksType = innerHooksType;
  }

  public onDefineParameters(): void {
    this.verboseFlag = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'If specified, log information useful for debugging.'
    });
  }

  public async onExecute(): Promise<void> {
    this.terminal.writeLine(`Starting ${this.actionName}`);

    if (
      this.verboseFlag.value &&
      this.heftConfiguration.terminalProvider instanceof ConsoleTerminalProvider
    ) {
      this.heftConfiguration.terminalProvider.verboseEnabled = true;
    }

    let encounteredError: boolean = false;
    try {
      await this.executeInner();
    } catch (e) {
      encounteredError = true;
      throw e;
    } finally {
      this.terminal.writeLine(
        Colors.bold(
          (encounteredError ? Colors.red : Colors.green)(
            `-------------------- Finished (${Math.round(performance.now()) / 1000}s) --------------------`
          )
        )
      );
      const projectPackageJson: IPackageJson = this.heftConfiguration.projectPackageJson;
      this.terminal.writeLine(
        `Project: ${projectPackageJson.name}`,
        Colors.dim(Colors.gray(`@${projectPackageJson.version}`))
      );
      this.terminal.writeLine(`Heft version: ${this.heftConfiguration.heftPackageJson.version}`);
      this.terminal.writeLine(`Node version: ${process.version}`);
    }
  }

  /**
   * @internal
   */
  public async executeInner(
    // Remove this when build and test are separated
    actionExecute: (actionData: TActionData) => Promise<void> = this.actionExecute.bind(this)
  ): Promise<void> {
    const actionData: TActionData = this._getActionData();

    this.actionHook.call(actionData);

    await actionData.hooks.loadActionConfiguration.promise();
    await actionData.hooks.afterLoadActionConfiguration.promise();

    if (actionData.hooks.override.isUsed()) {
      // Call this with actionData to get around the issue of the gulpPlugin's override of test needing build's
      // actionData
      await actionData.hooks.override.promise(actionData);
    } else {
      await actionExecute(actionData);
    }
  }

  /**
   * @virtual
   */
  protected async actionExecute(actionData: TActionData): Promise<void> {
    throw new Error(
      `${this.actionName}: override hook is not used and no default action executor is provided.`
    );
  }

  protected abstract getDefaultActionData(): Omit<TActionData, 'hooks'>;

  private _getActionData(): TActionData {
    const actionData: TActionData = this.getDefaultActionData() as TActionData;
    if (actionData.hasOwnProperty('hooks')) {
      throw new Error(
        'A "hooks" property must not be provided by getDefaultActionData. Hooks must be specified in the ' +
          'HeftBaseAction constructor'
      );
    }

    actionData.hooks = new this._innerHooksType();

    for (const actionDataUpdater of this._actionDataUpdaters) {
      actionDataUpdater(actionData);
    }

    return actionData;
  }
}
