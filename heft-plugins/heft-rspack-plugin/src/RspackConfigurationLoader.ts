// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import type * as TRspack from '@rspack/core';
import { FileSystem } from '@rushstack/node-core-library';
import type { IHeftTaskSession, HeftConfiguration } from '@rushstack/heft';

import type { IRspackPluginOptions } from './RspackPlugin';
import {
  PLUGIN_NAME,
  STAGE_LOAD_LOCAL_CONFIG,
  type IRspackConfiguration,
  type IRspackConfigurationFnEnvironment,
  type IRspackPluginAccessorHooks
} from './shared';

type IRspackConfigJsExport =
  | TRspack.Configuration
  | TRspack.Configuration[]
  | Promise<TRspack.Configuration>
  | Promise<TRspack.Configuration[]>
  | ((env: IRspackConfigurationFnEnvironment) => TRspack.Configuration | TRspack.Configuration[])
  | ((env: IRspackConfigurationFnEnvironment) => Promise<TRspack.Configuration | TRspack.Configuration[]>);
type IRspackConfigJs = IRspackConfigJsExport | { default: IRspackConfigJsExport };

/**
 * @internal
 */
export interface ILoadRspackConfigurationOptions {
  taskSession: IHeftTaskSession;
  heftConfiguration: HeftConfiguration;
  serveMode: boolean;
  loadRspackAsyncFn: () => Promise<typeof TRspack>;
  hooks: Pick<IRspackPluginAccessorHooks, 'onLoadConfiguration' | 'onConfigure' | 'onAfterConfigure'>;

  _tryLoadConfigFileAsync?: typeof tryLoadRspackConfigurationFileAsync;
}

const DEFAULT_RSPACK_CONFIG_PATH: './rspack.config.js' = './rspack.config.js';
const DEFAULT_RSPACK_DEV_CONFIG_PATH: './rspack.dev.config.js' = './rspack.dev.config.js';

/**
 * @internal
 */
export async function tryLoadRspackConfigurationAsync(
  options: ILoadRspackConfigurationOptions,
  pluginOptions: IRspackPluginOptions
): Promise<IRspackConfiguration | undefined> {
  const { taskSession, hooks, _tryLoadConfigFileAsync = tryLoadRspackConfigurationFileAsync } = options;
  const { logger } = taskSession;
  const { terminal } = logger;

  // Apply default behavior. Due to the state of `this._rspackConfiguration`, this code
  // will execute exactly once.
  hooks.onLoadConfiguration.tapPromise(
    {
      name: PLUGIN_NAME,
      stage: STAGE_LOAD_LOCAL_CONFIG
    },
    async () => {
      terminal.writeVerboseLine(`Attempting to load Rspack configuration from local file`);
      const rspackConfiguration: IRspackConfiguration | undefined = await _tryLoadConfigFileAsync(
        options,
        pluginOptions
      );

      if (rspackConfiguration) {
        terminal.writeVerboseLine(`Loaded Rspack configuration from local file.`);
      }

      return rspackConfiguration;
    }
  );

  // Obtain the Rspack configuration by calling into the hook.
  // The local configuration is loaded at STAGE_LOAD_LOCAL_CONFIG
  terminal.writeVerboseLine('Attempting to load Rspack configuration');
  let rspackConfiguration: IRspackConfiguration | false | undefined =
    await hooks.onLoadConfiguration.promise();

  if (rspackConfiguration === false) {
    terminal.writeLine('Rspack disabled by external plugin');
    rspackConfiguration = undefined;
  } else if (
    rspackConfiguration === undefined ||
    (Array.isArray(rspackConfiguration) && rspackConfiguration.length === 0)
  ) {
    terminal.writeLine('No Rspack configuration found');
    rspackConfiguration = undefined;
  } else {
    if (hooks.onConfigure.isUsed()) {
      // Allow for plugins to customise the configuration
      await hooks.onConfigure.promise(rspackConfiguration);
    }
    if (hooks.onAfterConfigure.isUsed()) {
      // Provide the finalized configuration
      await hooks.onAfterConfigure.promise(rspackConfiguration);
    }
  }
  return rspackConfiguration;
}

/**
 * @internal
 */
export async function tryLoadRspackConfigurationFileAsync(
  options: ILoadRspackConfigurationOptions,
  pluginOptions: IRspackPluginOptions
): Promise<IRspackConfiguration | undefined> {
  const { taskSession, heftConfiguration, loadRspackAsyncFn, serveMode } = options;
  const {
    logger,
    parameters: { production }
  } = taskSession;
  const { terminal } = logger;
  const { configurationPath, devConfigurationPath } = pluginOptions;
  let rspackConfigJs: IRspackConfigJs | undefined;

  try {
    const buildFolderPath: string = heftConfiguration.buildFolderPath;
    if (serveMode) {
      const devConfigPath: string = path.resolve(
        buildFolderPath,
        devConfigurationPath || DEFAULT_RSPACK_DEV_CONFIG_PATH
      );
      terminal.writeVerboseLine(`Attempting to load rspack configuration from "${devConfigPath}".`);
      rspackConfigJs = await _tryLoadRspackConfigurationFileInnerAsync(devConfigPath);
    }

    if (!rspackConfigJs) {
      const configPath: string = path.resolve(
        buildFolderPath,
        configurationPath || DEFAULT_RSPACK_CONFIG_PATH
      );
      terminal.writeVerboseLine(`Attempting to load rspack configuration from "${configPath}".`);
      rspackConfigJs = await _tryLoadRspackConfigurationFileInnerAsync(configPath);
    }
  } catch (error) {
    logger.emitError(error as Error);
  }

  if (rspackConfigJs) {
    const rspackConfig: IRspackConfigJsExport =
      (rspackConfigJs as { default: IRspackConfigJsExport }).default || rspackConfigJs;

    if (typeof rspackConfig === 'function') {
      // Defer loading of rspack until we know for sure that we will need it
      return rspackConfig({
        prod: production,
        production,
        taskSession,
        heftConfiguration,
        rspack: await loadRspackAsyncFn()
      });
    } else {
      return rspackConfig;
    }
  } else {
    return undefined;
  }
}

/**
 * @internal
 */
export async function _tryLoadRspackConfigurationFileInnerAsync(
  configurationPath: string
): Promise<IRspackConfigJs | undefined> {
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
      throw new Error(`Error loading Rspack configuration at "${configurationPath}": ${e}`);
    }
  } else {
    return undefined;
  }
}
