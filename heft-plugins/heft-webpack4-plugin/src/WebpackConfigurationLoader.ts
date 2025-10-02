// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type * as TWebpack from 'webpack';
import { FileSystem } from '@rushstack/node-core-library';
import type { IHeftTaskSession, HeftConfiguration } from '@rushstack/heft';

import type { IWebpackPluginOptions } from './Webpack4Plugin';
import {
  PLUGIN_NAME,
  STAGE_LOAD_LOCAL_CONFIG,
  type IWebpackConfiguration,
  type IWebpackConfigurationFnEnvironment,
  type IWebpackPluginAccessorHooks
} from './shared';

type IWebpackConfigJsExport =
  | TWebpack.Configuration
  | TWebpack.Configuration[]
  | Promise<TWebpack.Configuration>
  | Promise<TWebpack.Configuration[]>
  | ((env: IWebpackConfigurationFnEnvironment) => TWebpack.Configuration | TWebpack.Configuration[])
  | ((env: IWebpackConfigurationFnEnvironment) => Promise<TWebpack.Configuration | TWebpack.Configuration[]>);
type IWebpackConfigJs = IWebpackConfigJsExport | { default: IWebpackConfigJsExport };

/**
 * @internal
 */
export interface ILoadWebpackConfigurationOptions {
  taskSession: IHeftTaskSession;
  heftConfiguration: HeftConfiguration;
  serveMode: boolean;
  loadWebpackAsyncFn: () => Promise<typeof TWebpack>;
  hooks: Pick<IWebpackPluginAccessorHooks, 'onLoadConfiguration' | 'onConfigure' | 'onAfterConfigure'>;

  _tryLoadConfigFileAsync?: typeof tryLoadWebpackConfigurationFileAsync;
}

const DEFAULT_WEBPACK_CONFIG_PATH: './webpack.config.js' = './webpack.config.js';
const DEFAULT_WEBPACK_DEV_CONFIG_PATH: './webpack.dev.config.js' = './webpack.dev.config.js';

/**
 * @internal
 */
export async function tryLoadWebpackConfigurationAsync(
  options: ILoadWebpackConfigurationOptions,
  pluginOptions: IWebpackPluginOptions
): Promise<IWebpackConfiguration | undefined> {
  const { taskSession, hooks, _tryLoadConfigFileAsync = tryLoadWebpackConfigurationFileAsync } = options;
  const { logger } = taskSession;
  const { terminal } = logger;

  // Apply default behavior. Due to the state of `this._webpackConfiguration`, this code
  // will execute exactly once.
  hooks.onLoadConfiguration.tapPromise(
    {
      name: PLUGIN_NAME,
      stage: STAGE_LOAD_LOCAL_CONFIG
    },
    async () => {
      terminal.writeVerboseLine(`Attempting to load Webpack configuration from local file`);
      const webpackConfiguration: IWebpackConfiguration | undefined = await _tryLoadConfigFileAsync(
        options,
        pluginOptions
      );

      if (webpackConfiguration) {
        terminal.writeVerboseLine(`Loaded Webpack configuration from local file.`);
      }

      return webpackConfiguration;
    }
  );

  // Obtain the webpack configuration by calling into the hook.
  // The local configuration is loaded at STAGE_LOAD_LOCAL_CONFIG
  terminal.writeVerboseLine('Attempting to load Webpack configuration');
  let webpackConfiguration: IWebpackConfiguration | false | undefined =
    await hooks.onLoadConfiguration.promise();

  if (webpackConfiguration === false) {
    terminal.writeLine('Webpack disabled by external plugin');
    webpackConfiguration = undefined;
  } else if (
    webpackConfiguration === undefined ||
    (Array.isArray(webpackConfiguration) && webpackConfiguration.length === 0)
  ) {
    terminal.writeLine('No Webpack configuration found');
    webpackConfiguration = undefined;
  } else {
    if (hooks.onConfigure.isUsed()) {
      // Allow for plugins to customise the configuration
      await hooks.onConfigure.promise(webpackConfiguration);
    }
    if (hooks.onAfterConfigure.isUsed()) {
      // Provide the finalized configuration
      await hooks.onAfterConfigure.promise(webpackConfiguration);
    }
  }
  return webpackConfiguration;
}

/**
 * @internal
 */
export async function tryLoadWebpackConfigurationFileAsync(
  options: ILoadWebpackConfigurationOptions,
  pluginOptions: IWebpackPluginOptions
): Promise<IWebpackConfiguration | undefined> {
  // TODO: Eventually replace this custom logic with a call to this utility in in webpack-cli:
  // https://github.com/webpack/webpack-cli/blob/next/packages/webpack-cli/lib/groups/ConfigGroup.js

  const { taskSession, heftConfiguration, loadWebpackAsyncFn, serveMode } = options;
  const {
    logger,
    parameters: { production }
  } = taskSession;
  const { terminal } = logger;
  const { configurationPath, devConfigurationPath } = pluginOptions;
  let webpackConfigJs: IWebpackConfigJs | undefined;

  try {
    const buildFolderPath: string = heftConfiguration.buildFolderPath;
    if (serveMode) {
      const devConfigPath: string = path.resolve(
        buildFolderPath,
        devConfigurationPath || DEFAULT_WEBPACK_DEV_CONFIG_PATH
      );
      terminal.writeVerboseLine(`Attempting to load webpack configuration from "${devConfigPath}".`);
      webpackConfigJs = await _tryLoadWebpackConfigurationFileInnerAsync(devConfigPath);
    }

    if (!webpackConfigJs) {
      const configPath: string = path.resolve(
        buildFolderPath,
        configurationPath || DEFAULT_WEBPACK_CONFIG_PATH
      );
      terminal.writeVerboseLine(`Attempting to load webpack configuration from "${configPath}".`);
      webpackConfigJs = await _tryLoadWebpackConfigurationFileInnerAsync(configPath);
    }
  } catch (error) {
    logger.emitError(error as Error);
  }

  if (webpackConfigJs) {
    const webpackConfig: IWebpackConfigJsExport =
      (webpackConfigJs as { default: IWebpackConfigJsExport }).default || webpackConfigJs;

    if (typeof webpackConfig === 'function') {
      // Defer loading of webpack until we know for sure that we will need it
      return webpackConfig({
        prod: production,
        production,
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

/**
 * @internal
 */
export async function _tryLoadWebpackConfigurationFileInnerAsync(
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
