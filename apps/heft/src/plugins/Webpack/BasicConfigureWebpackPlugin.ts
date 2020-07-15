// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Terminal, FileSystem } from '@rushstack/node-core-library';

import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { IBundleStage, IBuildActionContext, IBundleStageProperties } from '../../cli/actions/BuildAction';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';

const PLUGIN_NAME: string = 'BasicConfigureWebpackPlugin';

export class BasicConfigureWebpackPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftCompilation: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftCompilation.hooks.build.tap(PLUGIN_NAME, (build: IBuildActionContext) => {
      build.hooks.bundle.tap(PLUGIN_NAME, (bundle: IBundleStage) => {
        bundle.hooks.configureWebpack.tapPromise(PLUGIN_NAME, async () => {
          await this._loadWebpackConfigAsync(
            heftConfiguration.terminal,
            heftConfiguration.buildFolder,
            bundle.properties
          );
        });
      });
    });
  }

  private async _loadWebpackConfigAsync(
    terminal: Terminal,
    buildFolder: string,
    bundleProperties: IBundleStageProperties
  ): Promise<void> {
    if (bundleProperties.webpackConfigFilePath) {
      const fullWebpackConfigPath: string = path.resolve(buildFolder, bundleProperties.webpackConfigFilePath);
      if (FileSystem.exists(fullWebpackConfigPath)) {
        try {
          bundleProperties.webpackConfiguration = require(fullWebpackConfigPath);
        } catch (e) {
          throw new Error(`Error loading webpack configuration at "${fullWebpackConfigPath}": ${e}`);
        }
      }
    }
  }
}
