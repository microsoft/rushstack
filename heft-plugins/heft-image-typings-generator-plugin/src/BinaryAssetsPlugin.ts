// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration, IHeftTaskSession, IHeftTaskPlugin } from '@rushstack/heft';
import { Path } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import {
  createTypingsGeneratorAsync,
  type IRunGeneratorOptions,
  type IStaticAssetGeneratorOptions,
  type IStaticAssetTypingsGenerator
} from './StaticAssetTypingsGenerator';
import type { IStaticAssetTypingsConfigurationJson } from './types';

const PLUGIN_NAME: 'static-asset-typings-plugin' = 'static-asset-typings-plugin';

export interface IBinaryAssetsInlineConfigPluginOptions {
  configType: 'inline';
  /**
   * The inline configuration object.
   */
  config: IStaticAssetTypingsConfigurationJson;
}

export interface IBinaryAssetsFileConfigPluginOptions {
  configType: 'file';
  /**
   * The name of the riggable config file in the config/ folder.
   */
  configFileName: string;
}

export type IBinaryAssetPluginOptions =
  | IBinaryAssetsInlineConfigPluginOptions
  | IBinaryAssetsFileConfigPluginOptions;

export default class BinaryAssetsPlugin implements IHeftTaskPlugin<IBinaryAssetPluginOptions> {
  /**
   * Generate typings for text files before TypeScript compilation.
   */
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IBinaryAssetPluginOptions
  ): void {
    const slashNormalizedBuildFolderPath: string = Path.convertToSlashes(heftConfiguration.buildFolderPath);

    async function getVersionAndEmitOutputFilesAsync(
      relativePath: string,
      filePath: string,
      oldVersion: string | undefined
    ): Promise<string | undefined> {
      return 'versionless';
    }

    async function tryGetConfigAsync(
      terminal: ITerminal,
      buildFolder: string,
      rigConfig: HeftConfiguration['rigConfig']
    ): Promise<IStaticAssetTypingsConfigurationJson | undefined> {
      if (options?.configType === 'inline') {
        return options.config;
      } else {
        const { getConfigFromConfigFileAsync } = await import('./getConfigFromConfigFileAsync');
        const { configFileName } = options as IBinaryAssetsFileConfigPluginOptions;
        return getConfigFromConfigFileAsync(configFileName, terminal, buildFolder, rigConfig);
      }
    }

    const staticAssetGeneratorOptions: IStaticAssetGeneratorOptions = {
      tryGetConfigAsync,
      slashNormalizedBuildFolderPath,
      getVersionAndEmitOutputFilesAsync
    };

    let generator: IStaticAssetTypingsGenerator | undefined | false;

    async function createAndRunGeneratorAsync(runOptions: IRunGeneratorOptions): Promise<void> {
      if (generator === undefined) {
        // eslint-disable-next-line require-atomic-updates
        generator = await createTypingsGeneratorAsync(
          taskSession,
          heftConfiguration,
          staticAssetGeneratorOptions
        );
      }

      if (generator === false) {
        return;
      }

      await generator.runIncrementalAsync(runOptions);
    }

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, createAndRunGeneratorAsync);
    taskSession.hooks.runIncremental.tapPromise(PLUGIN_NAME, createAndRunGeneratorAsync);
  }
}
