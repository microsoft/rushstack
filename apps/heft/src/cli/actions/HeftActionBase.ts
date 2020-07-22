// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineAction,
  CommandLineFlagParameter,
  ICommandLineActionOptions
} from '@rushstack/ts-command-line';
import { Terminal, IPackageJson, Colors, ConsoleTerminalProvider } from '@rushstack/node-core-library';
import { performance } from 'perf_hooks';

import { MetricsCollector } from '../../metrics/MetricsCollector';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { PluginManager } from '../../pluginFramework/PluginManager';
import { BuildStage } from '../../stages/BuildStage';
import { CleanStage } from '../../stages/CleanStage';
import { DevDeployStage } from '../../stages/DevDeployStage';
import { TestStage } from '../../stages/TestStage';

export interface IStages {
  buildStage: BuildStage;
  cleanStage: CleanStage;
  devDeployStage: DevDeployStage;
  testStage: TestStage;
}

export interface IHeftActionBaseOptions {
  terminal: Terminal;
  metricsCollector: MetricsCollector;
  heftConfiguration: HeftConfiguration;
  pluginManager: PluginManager;
  stages: IStages;
}

export abstract class HeftActionBase extends CommandLineAction {
  protected readonly terminal: Terminal;
  protected readonly metricsCollector: MetricsCollector;
  protected readonly heftConfiguration: HeftConfiguration;
  protected readonly stages: IStages;
  protected verboseFlag: CommandLineFlagParameter;

  public constructor(
    commandLineOptions: ICommandLineActionOptions,
    heftActionOptions: IHeftActionBaseOptions
  ) {
    super(commandLineOptions);
    this.terminal = heftActionOptions.terminal;
    this.metricsCollector = heftActionOptions.metricsCollector;
    this.heftConfiguration = heftActionOptions.heftConfiguration;
    this.stages = heftActionOptions.stages;
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
      await this.actionExecuteAsync();
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
   * @virtual
   */
  protected abstract actionExecuteAsync(): Promise<void>;
}
