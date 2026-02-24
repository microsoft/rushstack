// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';

import type { HeftConfiguration, IHeftTaskSession, IHeftTaskPlugin } from '@rushstack/heft';
import { Async, FileSystem } from '@rushstack/node-core-library';

import {
  createTypingsGeneratorAsync,
  tryGetConfigFromPluginOptionsAsync,
  type IRunGeneratorOptions,
  type IStaticAssetGeneratorOptions,
  type IStaticAssetTypingsGenerator
} from './StaticAssetTypingsGenerator';
import type { IAssetPluginOptions, ITextStaticAssetTypingsConfigurationJson } from './types';

const PLUGIN_NAME: 'text-assets-plugin' = 'text-assets-plugin';

// Pre-allocated preamble/postamble buffers to avoid repeated allocations.
// Used with FileSystem.writeBuffersToFileAsync (writev) for efficient output.
const CJS_PREAMBLE: Buffer = Buffer.from(
  '"use strict"\nObject.defineProperty(exports, "__esModule", { value: true });\nvar content = '
);
const CJS_POSTAMBLE: Buffer = Buffer.from(';\nexports.default = content;\n');
const ESM_PREAMBLE: Buffer = Buffer.from('const content = ');
const ESM_POSTAMBLE: Buffer = Buffer.from(';\nexport default content;\n');

export default class TextAssetsPlugin
  implements IHeftTaskPlugin<IAssetPluginOptions<ITextStaticAssetTypingsConfigurationJson>>
{
  /**
   * Generate typings for text files before TypeScript compilation.
   */
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IAssetPluginOptions<ITextStaticAssetTypingsConfigurationJson>
  ): void {
    let generatorPromise: Promise<IStaticAssetTypingsGenerator | false> | undefined;

    async function initializeGeneratorAsync(): Promise<IStaticAssetTypingsGenerator | false> {
      const { slashNormalizedBuildFolderPath, rigConfig } = heftConfiguration;

      const options: ITextStaticAssetTypingsConfigurationJson | undefined =
        await tryGetConfigFromPluginOptionsAsync(
          taskSession.logger.terminal,
          slashNormalizedBuildFolderPath,
          rigConfig,
          pluginOptions,
          'text'
        );

      if (options) {
        const { fileExtensions, sourceFolderPath, generatedTsFolders, cjsOutputFolders, esmOutputFolders } =
          options;

        const resolvedCjsOutputFolders: string[] = cjsOutputFolders.map(
          (jsPath) => `${slashNormalizedBuildFolderPath}/${jsPath}`
        );
        const resolvedEsmOutputFolders: string[] =
          esmOutputFolders?.map((jsPath) => `${slashNormalizedBuildFolderPath}/${jsPath}`) ?? [];
        const jsOutputFolders: string[] = [...resolvedCjsOutputFolders, ...resolvedEsmOutputFolders];

        function getAdditionalOutputFiles(relativePath: string): string[] {
          return jsOutputFolders.map((folder) => `${folder}/${relativePath}.js`);
        }

        async function getVersionAndEmitOutputFilesAsync(
          filePath: string,
          relativePath: string,
          oldVersion: string | undefined
        ): Promise<string | undefined> {
          const fileContents: Buffer = await FileSystem.readFileToBufferAsync(filePath);
          const fileVersion: string = createHash('sha1').update(fileContents).digest('base64');
          if (fileVersion === oldVersion) {
            return;
          }

          const stringFileContents: string = fileContents.toString('utf8');

          const contentBuffer: Buffer = Buffer.from(JSON.stringify(stringFileContents));

          const outputs: { path: string; buffers: NodeJS.ArrayBufferView[] }[] = [];
          for (const folder of resolvedCjsOutputFolders) {
            outputs.push({
              path: `${folder}/${relativePath}.js`,
              buffers: [CJS_PREAMBLE, contentBuffer, CJS_POSTAMBLE]
            });
          }
          for (const folder of resolvedEsmOutputFolders) {
            outputs.push({
              path: `${folder}/${relativePath}.js`,
              buffers: [ESM_PREAMBLE, contentBuffer, ESM_POSTAMBLE]
            });
          }

          await Async.forEachAsync(outputs, async ({ path, buffers }) => {
            await FileSystem.writeBuffersToFileAsync(path, buffers, { ensureFolderExists: true });
          });

          return fileVersion;
        }

        const staticAssetGeneratorOptions: IStaticAssetGeneratorOptions = {
          tryGetConfigAsync: async () => {
            return {
              fileExtensions,
              sourceFolderPath,
              generatedTsFolders
            };
          },
          slashNormalizedBuildFolderPath,
          getAdditionalOutputFiles,
          getVersionAndEmitOutputFilesAsync
        };

        return createTypingsGeneratorAsync(taskSession, staticAssetGeneratorOptions);
      } else {
        return false;
      }
    }

    async function createAndRunGeneratorAsync(runOptions: IRunGeneratorOptions): Promise<void> {
      if (generatorPromise === undefined) {
        generatorPromise = initializeGeneratorAsync();
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
