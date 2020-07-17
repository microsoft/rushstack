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

import { MetricsCollector } from '../../metrics/MetricsCollector';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { PluginManager } from '../../pluginFramework/PluginManager';

/**
 * @public
 */
export interface IActionContext<
  THooks extends ActionHooksBase<TActionProperties>,
  TActionProperties extends object
> {
  hooks: THooks;
  properties: TActionProperties;
}

/**
 * @public
 */
export abstract class ActionHooksBase<TActionProperties extends object> {
  /**
   * This hook allows the action's execution to be completely overridden. Only the last-registered plugin
   * with an override hook provided applies.
   *
   * @beta
   */
  public readonly overrideAction: AsyncSeriesBailHook<TActionProperties> = new AsyncSeriesBailHook([
    'actionProperties'
  ]);

  public readonly loadActionConfiguration: AsyncSeriesHook = new AsyncSeriesHook();

  public readonly afterLoadActionConfiguration: AsyncSeriesHook = new AsyncSeriesHook();
}

export interface IHeftActionBaseOptions {
  terminal: Terminal;
  metricsCollector: MetricsCollector;
  heftConfiguration: HeftConfiguration;
  pluginManager: PluginManager;
}

export abstract class HeftActionBase<
  THooks extends ActionHooksBase<TActionProperties>,
  TActionProperties extends object
> extends CommandLineAction {
  public readonly actionHook: SyncHook<IActionContext<THooks, TActionProperties>>;
  protected readonly terminal: Terminal;
  protected readonly metricsCollector: MetricsCollector;
  protected readonly heftConfiguration: HeftConfiguration;
  protected verboseFlag: CommandLineFlagParameter;
  private readonly _innerHooksType: new () => THooks;

  public constructor(
    commandLineOptions: ICommandLineActionOptions,
    heftActionOptions: IHeftActionBaseOptions,
    innerHooksType: new () => THooks
  ) {
    super(commandLineOptions);
    this.terminal = heftActionOptions.terminal;
    this.metricsCollector = heftActionOptions.metricsCollector;
    this.heftConfiguration = heftActionOptions.heftConfiguration;
    this.actionHook = new SyncHook<IActionContext<THooks, TActionProperties>>(['action']);
    this._innerHooksType = innerHooksType;
    this.setStartTime();
  }

  public onDefineParameters(): void {
    this.verboseFlag = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'If specified, log information useful for debugging.'
    });
  }

  public setStartTime(): void {
    this.metricsCollector.setStartTime();
  }

  public recordMetrics(): void {
    this.metricsCollector.record(this.actionName);
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
      this.recordMetrics();

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
    actionExecute: (
      actionContext: IActionContext<THooks, TActionProperties>
    ) => Promise<void> = this.actionExecute.bind(this)
  ): Promise<void> {
    const actionProperties: TActionProperties = this.getDefaultActionProperties();
    const hooks: THooks = new this._innerHooksType();
    const actionContext: IActionContext<THooks, TActionProperties> = {
      hooks,
      properties: actionProperties
    };

    this.actionHook.call(actionContext);

    await hooks.loadActionConfiguration.promise();
    await hooks.afterLoadActionConfiguration.promise();

    if (hooks.overrideAction.isUsed()) {
      await hooks.overrideAction.promise(actionProperties);
    } else {
      await actionExecute(actionContext);
    }
  }

  /**
   * @virtual
   */
  protected async actionExecute(actionContext: IActionContext<THooks, TActionProperties>): Promise<void> {
    throw new Error(
      `${this.actionName}: override hook is not used and no default action executor is provided.`
    );
  }

  protected abstract getDefaultActionProperties(): TActionProperties;
}
