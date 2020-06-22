// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';
import * as path from 'path';

import { CommandLineParserBase } from './CommandLineParserBase';
import { CleanAction } from './actions/CleanAction';
import { BuildAction } from './actions/BuildAction';
import { DevDeployAction } from './actions/DevDeployAction';
import { StartAction } from './actions/StartAction';
import { TestAction } from './actions/TestAction';
import { PluginManager } from '../pluginFramework/PluginManager';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IHeftActionBaseOptions } from './actions/HeftActionBase';
import { HeftCompilation } from '../pluginFramework/HeftCompilation';

export class HeftToolsCommandLineParser extends CommandLineParserBase {
  private _pluginManager: PluginManager;
  private _heftConfiguration: HeftConfiguration;
  private _heftCompilation: HeftCompilation;

  public constructor() {
    super({
      toolFilename: 'heft',
      toolDescription: 'Heft is a pluggable build system designed for web projects.'
    });

    this._heftConfiguration = HeftConfiguration.initialize({
      cwd: process.cwd(),
      terminalProvider: this.terminalProvider
    });

    const actionOptions: IHeftActionBaseOptions = {
      terminal: this.terminal,
      pluginManager: this._pluginManager,
      heftConfiguration: this._heftConfiguration
    };

    const cleanAction: CleanAction = new CleanAction(actionOptions);
    const buildAction: BuildAction = new BuildAction({ ...actionOptions, cleanAction });
    const devDeployAction: DevDeployAction = new DevDeployAction(actionOptions);
    const startAction: StartAction = new StartAction(actionOptions);
    const testAction: TestAction = new TestAction({ ...actionOptions, cleanAction });

    this._heftCompilation = new HeftCompilation({
      getIsDebugMode: () => this.isDebug,

      cleanAction,
      buildAction,
      devDeployAction,
      startAction,
      testAction
    });
    this._pluginManager = new PluginManager({
      terminal: this.terminal,
      heftConfiguration: this._heftConfiguration,
      heftCompilation: this._heftCompilation
    });

    this.addAction(cleanAction);
    this.addAction(buildAction);
    this.addAction(devDeployAction);
    this.addAction(startAction);
    this.addAction(testAction);
  }

  protected initializePlugins(pluginSpecifiers: ReadonlyArray<string>): void {
    // Set up the gulp plugin by default if none are specified.
    if (
      pluginSpecifiers.length === 0 &&
      FileSystem.exists(path.resolve(this._heftConfiguration.buildFolder, 'gulpfile.js'))
    ) {
      this._pluginManager.initializePlugin(path.resolve(__dirname, '..', 'plugins', 'gulpPlugin.js'));
    }

    this._pluginManager.initializeDefaultPlugins();

    this._pluginManager.initializePluginsFromConfigFile();

    for (const pluginSpecifier of pluginSpecifiers) {
      this._pluginManager.initializePlugin(pluginSpecifier);
    }
  }
}
