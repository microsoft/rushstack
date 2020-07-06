// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineParser,
  CommandLineStringListParameter,
  CommandLineFlagParameter
} from '@rushstack/ts-command-line';
import {
  Terminal,
  InternalError,
  ConsoleTerminalProvider,
  ITerminalProvider
} from '@rushstack/node-core-library';

import { MetricsCollector } from '../metrics/MetricsCollector';
import { CleanAction } from './actions/CleanAction';
import { BuildAction } from './actions/BuildAction';
import { DevDeployAction } from './actions/DevDeployAction';
import { StartAction } from './actions/StartAction';
import { TestAction } from './actions/TestAction';
import { PluginManager } from '../pluginFramework/PluginManager';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IHeftActionBaseOptions } from './actions/HeftActionBase';
import { HeftSession } from '../pluginFramework/HeftSession';

export class HeftToolsCommandLineParser extends CommandLineParser {
  private _terminalProvider: ConsoleTerminalProvider;
  private _terminal: Terminal;
  private _metricsCollector: MetricsCollector;
  private _pluginManager: PluginManager;
  private _heftConfiguration: HeftConfiguration;
  private _heftSession: HeftSession;

  private _debugFlag: CommandLineFlagParameter;
  private _pluginsParameter: CommandLineStringListParameter;

  public get isDebug(): boolean {
    return this._debugFlag.value;
  }

  public get terminalProvider(): ITerminalProvider {
    return this._terminalProvider;
  }

  public get terminal(): Terminal {
    return this._terminal;
  }

  public get metricsCollector(): MetricsCollector {
    return this._metricsCollector;
  }

  public constructor() {
    super({
      toolFilename: 'heft',
      toolDescription: 'Heft is a pluggable build system designed for web projects.'
    });

    this._terminalProvider = new ConsoleTerminalProvider();
    this._terminal = new Terminal(this._terminalProvider);
    this._metricsCollector = new MetricsCollector();

    this._heftConfiguration = HeftConfiguration.initialize({
      cwd: process.cwd(),
      terminalProvider: this.terminalProvider
    });

    const actionOptions: IHeftActionBaseOptions = {
      terminal: this.terminal,
      metricsCollector: this.metricsCollector,
      pluginManager: this._pluginManager,
      heftConfiguration: this._heftConfiguration
    };

    const cleanAction: CleanAction = new CleanAction(actionOptions);
    const buildAction: BuildAction = new BuildAction({ ...actionOptions, cleanAction });
    const devDeployAction: DevDeployAction = new DevDeployAction(actionOptions);
    const startAction: StartAction = new StartAction(actionOptions);
    const testAction: TestAction = new TestAction({ ...actionOptions, cleanAction });

    this._heftSession = new HeftSession({
      getIsDebugMode: () => this.isDebug,

      cleanAction,
      buildAction,
      devDeployAction,
      startAction,
      testAction,
      metricsCollector: this.metricsCollector
    });
    this._pluginManager = new PluginManager({
      terminal: this.terminal,
      heftConfiguration: this._heftConfiguration,
      heftSession: this._heftSession
    });

    this.addAction(cleanAction);
    this.addAction(buildAction);
    this.addAction(devDeployAction);
    this.addAction(startAction);
    this.addAction(testAction);
  }

  protected onDefineParameters(): void {
    this._debugFlag = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });

    this._pluginsParameter = this.defineStringListParameter({
      parameterLongName: '--plugin',
      argumentName: 'PATH',
      description: 'Used to specify Heft plugins.'
    });
  }

  protected async onExecute(): Promise<void> {
    // Defensively set the exit code to 1 so if the tool crashes for whatever reason, we'll have a nonzero exit code.
    process.exitCode = 1;

    this._terminalProvider.verboseEnabled = this.isDebug;

    if (this.isDebug) {
      InternalError.breakInDebugger = true;
    }

    this._normalizeCwd();

    this._initializePlugins(this._pluginsParameter.values);

    try {
      await super.onExecute();
      await this._metricsCollector.flushAndTeardownAsync();
    } catch (e) {
      await this._reportErrorAndSetExitCode(e);
    }

    // If we make it here, things are fine and reset the exit code back to 0
    process.exitCode = 0;
  }

  private _normalizeCwd(): void {
    const buildFolder: string = this._heftConfiguration.buildFolder;
    this.terminal.writeLine(`Project build folder is "${buildFolder}"`);
    const currentCwd: string = process.cwd();
    if (currentCwd !== buildFolder) {
      // Update the CWD to the project's build root. Some tools, like Jest, use process.cwd()
      this.terminal.writeVerboseLine(`CWD is "${currentCwd}". Normalizing to project build folder.`);
      process.chdir(buildFolder);
    }
  }

  private _initializePlugins(pluginSpecifiers: ReadonlyArray<string>): void {
    this._pluginManager.initializeDefaultPlugins();

    this._pluginManager.initializePluginsFromConfigFile();

    for (const pluginSpecifier of pluginSpecifiers) {
      this._pluginManager.initializePlugin(pluginSpecifier);
    }
  }

  private async _reportErrorAndSetExitCode(error: Error): Promise<void> {
    this.terminal.writeErrorLine(error.toString());

    if (this.isDebug) {
      this._terminal.writeLine();
      this._terminal.writeErrorLine(error.stack!);
    }

    await this._metricsCollector.flushAndTeardownAsync();

    if (!process.exitCode || process.exitCode > 0) {
      process.exit(process.exitCode);
    } else {
      process.exit(1);
    }
  }
}
