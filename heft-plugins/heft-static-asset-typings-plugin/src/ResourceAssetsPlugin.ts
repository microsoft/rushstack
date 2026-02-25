// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration, IHeftTaskSession, IHeftTaskPlugin } from '@rushstack/heft';

import {
  createTypingsGeneratorAsync,
  tryGetConfigFromPluginOptionsAsync,
  type IRunGeneratorOptions,
  type IStaticAssetGeneratorOptions,
  type IStaticAssetTypingsGenerator
} from './StaticAssetTypingsGenerator.js';
import type { IAssetPluginOptions, IResourceStaticAssetTypingsConfigurationJson } from './types';

const PLUGIN_NAME: 'static-asset-typings-plugin' = 'static-asset-typings-plugin';

export default class ResourceAssetsPlugin
  implements IHeftTaskPlugin<IAssetPluginOptions<IResourceStaticAssetTypingsConfigurationJson>>
{
  /**
   * Generate typings for text files before TypeScript compilation.
   */
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IAssetPluginOptions<IResourceStaticAssetTypingsConfigurationJson>
  ): void {
    const { slashNormalizedBuildFolderPath, rigConfig } = heftConfiguration;
    const staticAssetGeneratorOptions: IStaticAssetGeneratorOptions = {
      tryGetConfigAsync: async (terminal) => {
        return await tryGetConfigFromPluginOptionsAsync(
          terminal,
          slashNormalizedBuildFolderPath,
          rigConfig,
          options,
          'resource'
        );
      },
      slashNormalizedBuildFolderPath,
      getVersionAndEmitOutputFilesAsync: async () => 'versionless'
    };

    let generatorPromise: Promise<IStaticAssetTypingsGenerator | false> | undefined;

    async function createAndRunGeneratorAsync(runOptions: IRunGeneratorOptions): Promise<void> {
      if (generatorPromise === undefined) {
        generatorPromise = createTypingsGeneratorAsync(taskSession, staticAssetGeneratorOptions);
      }

      const generator: IStaticAssetTypingsGenerator | false = await generatorPromise;
      if (generator === false) {
        return;
      }

      await generator.runIncrementalAsync(runOptions);
    }

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, createAndRunGeneratorAsync);
    taskSession.hooks.runIncremental.tapPromise(PLUGIN_NAME, createAndRunGeneratorAsync);
  }
}
