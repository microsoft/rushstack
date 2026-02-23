// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration, IHeftTaskSession, IHeftTaskPlugin } from '@rushstack/heft';

import {
  createTypingsGeneratorAsync,
  tryGetConfigFromPluginOptionsAsync,
  type IRunGeneratorOptions,
  type IStaticAssetGeneratorOptions,
  type IStaticAssetTypingsGenerator
} from './StaticAssetTypingsGenerator';
import type { IAssetPluginOptions, IBinaryStaticAssetTypingsConfigurationJson } from './types';

const PLUGIN_NAME: 'static-asset-typings-plugin' = 'static-asset-typings-plugin';

export default class BinaryAssetsPlugin
  implements IHeftTaskPlugin<IAssetPluginOptions<IBinaryStaticAssetTypingsConfigurationJson>>
{
  /**
   * Generate typings for text files before TypeScript compilation.
   */
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IAssetPluginOptions<IBinaryStaticAssetTypingsConfigurationJson>
  ): void {
    const { slashNormalizedBuildFolderPath, rigConfig } = heftConfiguration;
    const staticAssetGeneratorOptions: IStaticAssetGeneratorOptions = {
      tryGetConfigAsync: async (terminal) => {
        return await tryGetConfigFromPluginOptionsAsync(
          terminal,
          slashNormalizedBuildFolderPath,
          rigConfig,
          options,
          'binary'
        );
      },
      slashNormalizedBuildFolderPath,
      getVersionAndEmitOutputFilesAsync: async () => 'versionless'
    };

    let generator: IStaticAssetTypingsGenerator | undefined | false;

    async function createAndRunGeneratorAsync(runOptions: IRunGeneratorOptions): Promise<void> {
      if (generator === undefined) {
        // eslint-disable-next-line require-atomic-updates
        generator = await createTypingsGeneratorAsync(taskSession, staticAssetGeneratorOptions);
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
