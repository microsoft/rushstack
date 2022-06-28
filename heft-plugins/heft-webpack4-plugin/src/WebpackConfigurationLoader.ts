// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import type * as TWebpack from 'webpack';
import { FileSystem } from '@rushstack/node-core-library';
import type { IScopedLogger } from '@rushstack/heft';

import type { IWebpackConfiguration } from './shared';

/**
 * See https://webpack.js.org/api/cli/#environment-options
 */
interface IWebpackConfigFunctionEnv {
  prod: boolean;
  production: boolean;
}
type IWebpackConfigJsExport =
  | TWebpack.Configuration
  | TWebpack.Configuration[]
  | Promise<TWebpack.Configuration>
  | Promise<TWebpack.Configuration[]>
  | ((env: IWebpackConfigFunctionEnv) => TWebpack.Configuration | TWebpack.Configuration[])
  | ((env: IWebpackConfigFunctionEnv) => Promise<TWebpack.Configuration | TWebpack.Configuration[]>);
type IWebpackConfigJs = IWebpackConfigJsExport | { default: IWebpackConfigJsExport };

const WEBPACK_CONFIG_FILENAME: string = 'webpack.config.js';
const WEBPACK_DEV_CONFIG_FILENAME: string = 'webpack.dev.config.js';

export class WebpackConfigurationLoader {
  private _logger: IScopedLogger;
  private _production: boolean;
  private _serveMode: boolean;

  public constructor(logger: IScopedLogger, production: boolean, serveMode: boolean) {
    this._logger = logger;
    this._production = production;
    this._serveMode = serveMode;
  }

  public async tryLoadWebpackConfigAsync(buildFolder: string): Promise<IWebpackConfiguration | undefined> {
    // TODO: Eventually replace this custom logic with a call to this utility in in webpack-cli:
    // https://github.com/webpack/webpack-cli/blob/next/packages/webpack-cli/lib/groups/ConfigGroup.js

    let webpackConfigJs: IWebpackConfigJs | undefined;

    try {
      if (this._serveMode) {
        this._logger.terminal.writeVerboseLine(
          `Attempting to load webpack configuration from "${WEBPACK_DEV_CONFIG_FILENAME}".`
        );
        webpackConfigJs = await this._tryLoadWebpackConfigurationAsync(
          buildFolder,
          WEBPACK_DEV_CONFIG_FILENAME
        );
      }

      if (!webpackConfigJs) {
        this._logger.terminal.writeVerboseLine(
          `Attempting to load webpack configuration from "${WEBPACK_CONFIG_FILENAME}".`
        );
        webpackConfigJs = await this._tryLoadWebpackConfigurationAsync(buildFolder, WEBPACK_CONFIG_FILENAME);
      }
    } catch (error) {
      this._logger.emitError(error as Error);
    }

    if (webpackConfigJs) {
      const webpackConfig: IWebpackConfigJsExport =
        (webpackConfigJs as { default: IWebpackConfigJsExport }).default || webpackConfigJs;

      if (typeof webpackConfig === 'function') {
        return webpackConfig({ prod: this._production, production: this._production });
      } else {
        return webpackConfig;
      }
    } else {
      return undefined;
    }
  }

  private async _tryLoadWebpackConfigurationAsync(
    buildFolder: string,
    configurationFilename: string
  ): Promise<IWebpackConfigJs | undefined> {
    const fullWebpackConfigPath: string = path.join(buildFolder, configurationFilename);
    const configExists: boolean = await FileSystem.existsAsync(fullWebpackConfigPath);
    if (configExists) {
      try {
        return await import(fullWebpackConfigPath);
      } catch (e) {
        throw new Error(`Error loading webpack configuration at "${fullWebpackConfigPath}": ${e}`);
      }
    } else {
      return undefined;
    }
  }
}
