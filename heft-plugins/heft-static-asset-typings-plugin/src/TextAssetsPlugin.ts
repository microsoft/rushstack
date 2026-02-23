// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';

import type { HeftConfiguration, IHeftTaskSession, IHeftTaskPlugin } from '@rushstack/heft';
import { FileSystem } from '@rushstack/node-core-library';

import {
  createTypingsGeneratorAsync,
  tryGetConfigFromPluginOptionsAsync,
  type IRunGeneratorOptions,
  type IStaticAssetGeneratorOptions,
  type IStaticAssetTypingsGenerator
} from './StaticAssetTypingsGenerator';
import type { IAssetPluginOptions, ITextStaticAssetTypingsConfigurationJson } from './types';

const PLUGIN_NAME: 'text-assets-plugin' = 'text-assets-plugin';

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
    let generator: IStaticAssetTypingsGenerator | undefined | false;

    async function createAndRunGeneratorAsync(runOptions: IRunGeneratorOptions): Promise<void> {
      if (generator === undefined) {
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

            const stringifiedContents: string = JSON.stringify(stringFileContents);

            const outputs: Map<string, Buffer> = new Map();
            if (resolvedCjsOutputFolders.length) {
              const outputSource: string = [
                `"use strict"`,
                `Object.defineProperty(exports, "__esModule", { value: true });`,
                `var content = ${stringifiedContents};`,
                `exports.default = content;`
              ].join('\n');
              const outputBuffer: Buffer = Buffer.from(outputSource);
              for (const folder of resolvedCjsOutputFolders) {
                outputs.set(`${folder}/${relativePath}.js`, outputBuffer);
              }
            }

            if (resolvedEsmOutputFolders.length) {
              const outputSource: string = [
                `const content = ${stringifiedContents};`,
                `export default content;`
              ].join('\n');
              const outputBuffer: Buffer = Buffer.from(outputSource);
              for (const folder of resolvedEsmOutputFolders) {
                outputs.set(`${folder}/${relativePath}.js`, outputBuffer);
              }
            }

            await Promise.all(
              Array.from(outputs, ([outputPath, outputBuffer]) =>
                FileSystem.writeFileAsync(outputPath, outputBuffer, { ensureFolderExists: true })
              )
            );

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

          // eslint-disable-next-line require-atomic-updates
          generator = await createTypingsGeneratorAsync(taskSession, staticAssetGeneratorOptions);
        } else {
          // eslint-disable-next-line require-atomic-updates
          generator = false;
        }
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
