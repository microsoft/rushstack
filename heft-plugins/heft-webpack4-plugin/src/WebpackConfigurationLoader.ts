// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import type * as TWebpack from 'webpack';
import { FileSystem } from '@rushstack/node-core-library';
import type { IScopedLogger, IHeftTaskSession, HeftConfiguration } from '@rushstack/heft';

import type { IWebpackPluginOptions } from './Webpack4Plugin';
import type { IWebpackConfiguration, IWebpackConfigurationFnEnvironment } from './shared';

type IWebpackConfigJsExport =
  | TWebpack.Configuration
  | TWebpack.Configuration[]
  | Promise<TWebpack.Configuration>
  | Promise<TWebpack.Configuration[]>
  | ((env: IWebpackConfigurationFnEnvironment) => TWebpack.Configuration | TWebpack.Configuration[])
  | ((env: IWebpackConfigurationFnEnvironment) => Promise<TWebpack.Configuration | TWebpack.Configuration[]>);
type IWebpackConfigJs = IWebpackConfigJsExport | { default: IWebpackConfigJsExport };

interface ILoadWebpackConfigurationOptions extends IWebpackPluginOptions {
  taskSession: IHeftTaskSession;
  heftConfiguration: HeftConfiguration;
  loadWebpackAsyncFn: () => Promise<typeof TWebpack>;
}

const DEFAULT_WEBPACK_CONFIG_PATH: './webpack.config.js' = './webpack.config.js';
const DEFAULT_WEBPACK_DEV_CONFIG_PATH: './webpack.dev.config.js' = './webpack.dev.config.js';

export class WebpackConfigurationLoader {
  private readonly _logger: IScopedLogger;
  private readonly _production: boolean;
  private readonly _serveMode: boolean;

  public constructor(logger: IScopedLogger, production: boolean, serveMode: boolean) {
    this._logger = logger;
    this._production = production;
    this._serveMode = serveMode;
  }

  public async tryLoadWebpackConfigurationAsync(
    options: ILoadWebpackConfigurationOptions
  ): Promise<IWebpackConfiguration | undefined> {
    // TODO: Eventually replace this custom logic with a call to this utility in in webpack-cli:
    // https://github.com/webpack/webpack-cli/blob/next/packages/webpack-cli/lib/groups/ConfigGroup.js

    const { taskSession, heftConfiguration, configurationPath, devConfigurationPath, loadWebpackAsyncFn } =
      options;
    let webpackConfigJs: IWebpackConfigJs | undefined;

    try {
      const buildFolderPath: string = heftConfiguration.buildFolderPath;
      if (this._serveMode) {
        const devConfigPath: string = path.resolve(
          buildFolderPath,
          devConfigurationPath || DEFAULT_WEBPACK_DEV_CONFIG_PATH
        );
        this._logger.terminal.writeVerboseLine(
          `Attempting to load webpack configuration from "${devConfigPath}".`
        );
        webpackConfigJs = await this._tryLoadWebpackConfigurationInnerAsync(devConfigPath);
      }

      if (!webpackConfigJs) {
        const configPath: string = path.resolve(
          buildFolderPath,
          configurationPath || DEFAULT_WEBPACK_CONFIG_PATH
        );
        this._logger.terminal.writeVerboseLine(
          `Attempting to load webpack configuration from "${configPath}".`
        );
        webpackConfigJs = await this._tryLoadWebpackConfigurationInnerAsync(configPath);
      }
    } catch (error) {
      this._logger.emitError(error as Error);
    }

    if (webpackConfigJs) {
      const webpackConfig: IWebpackConfigJsExport =
        (webpackConfigJs as { default: IWebpackConfigJsExport }).default || webpackConfigJs;

      if (typeof webpackConfig === 'function') {
        // Defer loading of webpack until we know for sure that we will need it
        return webpackConfig({
          prod: this._production,
          production: this._production,
          taskSession,
          heftConfiguration,
          webpack: await loadWebpackAsyncFn()
        });
      } else {
        return webpackConfig;
      }
    } else {
      return undefined;
    }
  }

  private async _tryLoadWebpackConfigurationInnerAsync(
    configurationPath: string
  ): Promise<IWebpackConfigJs | undefined> {
    const configExists: boolean = await FileSystem.existsAsync(configurationPath);
    if (configExists) {
      try {
        return await import(configurationPath);
      } catch (e) {
        const error: NodeJS.ErrnoException = e as NodeJS.ErrnoException;
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
          // No configuration found, return undefined.
          return undefined;
        }
        throw new Error(`Error loading webpack configuration at "${configurationPath}": ${e}`);
      }
    } else {
      return undefined;
    }
  }
}
