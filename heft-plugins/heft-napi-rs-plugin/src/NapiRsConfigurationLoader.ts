// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { HeftConfiguration, IHeftTaskSession } from '@rushstack/heft';
import { FileSystem } from '@rushstack/node-core-library';

import type { INapiRsPluginOptions } from './NapiRsPlugin';
import {
  type INapiRsConfiguration,
  type INapiRsPluginAccessorHooks,
  STAGE_LOAD_LOCAL_CONFIG,
  PLUGIN_NAME,
  INapiRsConfigurationFnOptions,
  NapiRsCliImport
} from './shared';

type INapiRsConfigJsExport =
  | INapiRsConfiguration
  | Promise<INapiRsConfiguration>
  | ((options: INapiRsConfigurationFnOptions) => INapiRsConfiguration)
  | ((options: INapiRsConfigurationFnOptions) => Promise<INapiRsConfiguration>);
type INapiRsConfigJs = INapiRsConfigJsExport | { default: INapiRsConfigJsExport };

/**
 * @internal
 */
export interface ILoadNapiRsConfigurationOptions {
  taskSession: IHeftTaskSession;
  heftConfiguration: HeftConfiguration;
  loadNapiRsAsyncFn: () => Promise<NapiRsCliImport>;
  hooks: Pick<INapiRsPluginAccessorHooks, 'onLoadConfiguration' | 'onConfigure' | 'onAfterConfigure'>;

  _tryLoadConfigFileAsync?: typeof tryLoadNapiRsConfigurationFileAsync;
}

const DEFAULT_NAPI_RS_CONFIG_PATH: './napi-rs.config.mjs' = './napi-rs.config.mjs';

/**
 * @internal
 */
export async function tryLoadNapiRsConfigurationAsync(
  options: ILoadNapiRsConfigurationOptions,
  pluginOptions: INapiRsPluginOptions
): Promise<INapiRsConfiguration | undefined> {
  const { taskSession, hooks, _tryLoadConfigFileAsync = tryLoadNapiRsConfigurationFileAsync } = options;
  const { logger } = taskSession;
  const { terminal } = logger;

  // Apply default behavior. Due to the state of `this._napiRsConfiguration`, this code
  // will execute exactly once.
  hooks.onLoadConfiguration.tapPromise(
    {
      name: PLUGIN_NAME,
      stage: STAGE_LOAD_LOCAL_CONFIG
    },
    async () => {
      terminal.writeVerboseLine(`Attempting to load NAPI-RS configuration from local file`);
      const napiRsConfiguration: INapiRsConfiguration | undefined = await _tryLoadConfigFileAsync(
        options,
        pluginOptions
      );

      if (napiRsConfiguration) {
        terminal.writeVerboseLine(`Loaded NAPI-RS configuration from local file.`);
      }

      return napiRsConfiguration;
    }
  );

  // Obtain the NAPI-RS configuration by calling into the hook.
  // The local configuration is loaded at STAGE_LOAD_LOCAL_CONFIG
  terminal.writeVerboseLine('Attempting to load NAPI-RS configuration');
  let napiRsConfiguration: INapiRsConfiguration | false | undefined =
    await hooks.onLoadConfiguration.promise();

  if (napiRsConfiguration === false) {
    terminal.writeLine('NAPI-RS disabled by external plugin');
    napiRsConfiguration = undefined;
  } else if (
    napiRsConfiguration === undefined ||
    (Array.isArray(napiRsConfiguration) && napiRsConfiguration.length === 0)
  ) {
    terminal.writeLine('No NAPI-RS configuration found');
    napiRsConfiguration = undefined;
  } else {
    if (hooks.onConfigure.isUsed()) {
      // Allow for plugins to customize the configuration
      await hooks.onConfigure.promise(napiRsConfiguration);
    }
    if (hooks.onAfterConfigure.isUsed()) {
      // Provide the finalized configuration
      await hooks.onAfterConfigure.promise(napiRsConfiguration);
    }
  }
  return napiRsConfiguration as INapiRsConfiguration | undefined;
}

/**
 * @internal
 */
export async function tryLoadNapiRsConfigurationFileAsync(
  options: ILoadNapiRsConfigurationOptions,
  pluginOptions: INapiRsPluginOptions
): Promise<INapiRsConfiguration | undefined> {
  const { taskSession, heftConfiguration, loadNapiRsAsyncFn } = options;
  const { logger } = taskSession;
  const { terminal } = logger;
  const { configurationPath } = pluginOptions;
  let napiRsConfigJs: INapiRsConfigJs | undefined;

  try {
    const buildFolderPath: string = heftConfiguration.buildFolderPath;
    const configPath: string = path.resolve(
      buildFolderPath,
      configurationPath || DEFAULT_NAPI_RS_CONFIG_PATH
    );
    terminal.writeVerboseLine(`Attempting to load NAPI-RS configuration from "${configPath}".`);
    napiRsConfigJs = await _tryLoadNapiRsConfigurationFileInnerAsync(configPath);
  } catch (error) {
    logger.emitError(error as Error);
  }

  if (napiRsConfigJs) {
    const napiRsConfig: INapiRsConfigJsExport =
      (napiRsConfigJs as { default: INapiRsConfigJsExport }).default ||
      (napiRsConfigJs as INapiRsConfigJsExport);

    if (typeof napiRsConfig === 'function') {
      // Defer loading of napiRs until we know for sure that we will need it
      return napiRsConfig({
        taskSession,
        heftConfiguration,
        napiRs: await loadNapiRsAsyncFn()
      });
    } else {
      return napiRsConfig;
    }
  } else {
    return undefined;
  }
}

/**
 * @internal
 */
export async function _tryLoadNapiRsConfigurationFileInnerAsync(
  configurationPath: string
): Promise<INapiRsConfigJs | undefined> {
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
      throw new Error(`Error loading NAPI-RS configuration at "${configurationPath}": ${e}`);
    }
  } else {
    return undefined;
  }
}
