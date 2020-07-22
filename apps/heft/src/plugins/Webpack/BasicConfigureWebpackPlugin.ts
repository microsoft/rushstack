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
  IBuildStageProperties,
  IWebpackConfiguration
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
const WEBPACK_CONFIG_FILENAME: string = 'webpack.config.js';
const WEBPACK_DEV_CONFIG_FILENAME: string = 'webpack.dev.config.js';

export class BasicConfigureWebpackPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftCompilation: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftCompilation.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.bundle.tap(PLUGIN_NAME, (bundle: IBundleSubstage) => {
        bundle.hooks.configureWebpack.tapPromise(
          PLUGIN_NAME,
          async (existingConfiguration: IWebpackConfiguration) => {
            return await this._loadWebpackConfigAsync(
              existingConfiguration,
              heftConfiguration.terminal,
              heftConfiguration.buildFolder,
              build.properties,
              bundle.properties
            );
          }
        );
      });
    });
  }

  private async _loadWebpackConfigAsync(
    existingConfiguration: IWebpackConfiguration,
    terminal: Terminal,
    buildFolder: string,
    buildProperties: IBuildStageProperties,
    bundleProperties: IBundleSubstageProperties
  ): Promise<IWebpackConfiguration> {
    if (existingConfiguration) {
      terminal.writeVerboseLine(
        'Skipping loading webpack config file because the webpack config has already been set.'
      );
      return existingConfiguration;
    } else {
      // TODO: Eventually replace this custom logic with a call to this utility in in webpack-cli:
      // https://github.com/webpack/webpack-cli/blob/next/packages/webpack-cli/lib/groups/ConfigGroup.js

      let webpackConfigJs: IWebpackConfigJs | undefined;

      if (buildProperties.serveMode) {
        terminal.writeVerboseLine(
          `Attempting to load webpack configuration from "${WEBPACK_DEV_CONFIG_FILENAME}".`
        );
        webpackConfigJs = this._tryLoadWebpackConfiguration(buildFolder, WEBPACK_DEV_CONFIG_FILENAME);
      }

      if (!webpackConfigJs) {
        terminal.writeVerboseLine(
          `Attempting to load webpack configuration from "${WEBPACK_CONFIG_FILENAME}".`
        );
        webpackConfigJs = this._tryLoadWebpackConfiguration(buildFolder, WEBPACK_CONFIG_FILENAME);
      }

      if (webpackConfigJs) {
        const webpackConfig: IWebpackConfigJsExport =
          (webpackConfigJs as { default: IWebpackConfigJsExport }).default || webpackConfigJs;

        if (typeof webpackConfig === 'function') {
          return await Promise.resolve(
            webpackConfig({ prod: buildProperties.production, production: buildProperties.production })
          );
        } else {
          return await Promise.resolve(webpackConfig);
        }
      } else {
        return undefined;
      }
    }
  }

  private _tryLoadWebpackConfiguration(
    buildFolder: string,
    configurationFilename: string
  ): IWebpackConfigJs | undefined {
    const fullWebpackConfigPath: string = path.join(buildFolder, configurationFilename);
    if (FileSystem.exists(fullWebpackConfigPath)) {
      try {
        return require(fullWebpackConfigPath);
      } catch (e) {
        throw new Error(`Error loading webpack configuration at "${fullWebpackConfigPath}": ${e}`);
      }
    } else {
      return undefined;
    }
  }
}
