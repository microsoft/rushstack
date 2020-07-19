// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Terminal, FileSystem } from '@rushstack/node-core-library';
import * as webpack from 'webpack';

import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import {
  IBuildStageContext,
  IBundleSubstage,
  IBundleSubstageProperties,
  IBuildStageProperties
} from '../../stages/BuildStage';

/**
 * See https://webpack.js.org/api/cli/#environment-options
 */
interface IWebpackConfigFunctionEnv {
  prod: boolean;
  production: boolean;
}
type IWebpackConfigJsExport =
  | webpack.Configuration
  | webpack.Configuration[]
  | Promise<webpack.Configuration>
  | Promise<webpack.Configuration[]>
  | ((env: IWebpackConfigFunctionEnv) => webpack.Configuration | webpack.Configuration[])
  | ((env: IWebpackConfigFunctionEnv) => Promise<webpack.Configuration | webpack.Configuration[]>);
type IWebpackConfigJs = IWebpackConfigJsExport | { default: IWebpackConfigJsExport };

const PLUGIN_NAME: string = 'BasicConfigureWebpackPlugin';

export class BasicConfigureWebpackPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftCompilation: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftCompilation.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.bundle.tap(PLUGIN_NAME, (bundle: IBundleSubstage) => {
        bundle.hooks.configureWebpack.tapPromise(PLUGIN_NAME, async () => {
          await this._loadWebpackConfigAsync(
            heftConfiguration.terminal,
            heftConfiguration.buildFolder,
            build.properties,
            bundle.properties
          );
        });
      });
    });
  }

  private async _loadWebpackConfigAsync(
    terminal: Terminal,
    buildFolder: string,
    buildProperties: IBuildStageProperties,
    bundleProperties: IBundleSubstageProperties
  ): Promise<void> {
    if (bundleProperties.webpackConfiguration) {
      terminal.writeVerboseLine(
        'Skipping loading webpack config file because the webpack config has already been set.'
      );
    } else {
      // TODO: Eventually replace this custom logic with a call to this utility in in webpack-cli:
      // https://github.com/webpack/webpack-cli/blob/next/packages/webpack-cli/lib/groups/ConfigGroup.js
      const webpackConfigFilePath: string | undefined = buildProperties.serveMode
        ? bundleProperties.webpackServeConfigFilePath || bundleProperties.webpackConfigFilePath
        : bundleProperties.webpackConfigFilePath;

      if (webpackConfigFilePath) {
        terminal.writeVerboseLine(
          `Attempting to load webpack configuration from "${webpackConfigFilePath}".`
        );

        const fullWebpackConfigPath: string = path.resolve(buildFolder, webpackConfigFilePath);
        if (FileSystem.exists(fullWebpackConfigPath)) {
          try {
            let webpackConfigJs: IWebpackConfigJs = require(fullWebpackConfigPath);
            const webpackConfig =
              (webpackConfigJs as { default: IWebpackConfigJsExport }).default || webpackConfigJs;

            if (typeof webpackConfig === 'function') {
              bundleProperties.webpackConfiguration = await Promise.resolve(
                webpackConfig({ prod: buildProperties.production, production: buildProperties.production })
              );
            } else {
              bundleProperties.webpackConfiguration = await Promise.resolve(webpackConfig);
            }
          } catch (e) {
            throw new Error(`Error loading webpack configuration at "${fullWebpackConfigPath}": ${e}`);
          }
        }
      }
    }
  }
}
