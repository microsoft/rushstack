// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';

import type { HeftConfiguration, IHeftTaskSession, IHeftTaskPlugin } from '@rushstack/heft';
import { FileSystem, Path } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import {
  createTypingsGeneratorAsync,
  type IRunGeneratorOptions,
  type IStaticAssetGeneratorOptions,
  type IStaticAssetTypingsGenerator
} from './StaticAssetTypingsGenerator';
import { getConfigFromConfigFileAsync } from './getConfigFromConfigFileAsync';
import type { IStaticAssetTypingsConfigurationJson } from './types';

const PLUGIN_NAME: 'text-assets-plugin' = 'text-assets-plugin';

export interface ITextAssetsPluginOptions {
  cjsOutputFolders: string[];
  esmOutputFolders: string[];
  configFileName?: string;
}

export default class TextAssetsPlugin implements IHeftTaskPlugin<ITextAssetsPluginOptions> {
  /**
   * Generate typings for text files before TypeScript compilation.
   */
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: ITextAssetsPluginOptions
  ): void {
    const slashNormalizedBuildFolderPath: string = Path.convertToSlashes(heftConfiguration.buildFolderPath);

    const cjsOutputFolders: string[] = options.cjsOutputFolders.map(
      (jsPath) => `${slashNormalizedBuildFolderPath}/${jsPath}`
    );
    const esmOutputFolders: string[] = options.esmOutputFolders.map(
      (jsPath) => `${slashNormalizedBuildFolderPath}/${jsPath}`
    );
    const jsOutputFolders: string[] = [...cjsOutputFolders, ...esmOutputFolders];

    const { configFileName = 'text-assets.json' } = options;

    function getAdditionalOutputFiles(relativePath: string): string[] {
      return jsOutputFolders.map((folder) => `${folder}/${relativePath}.js`);
    }

    async function tryGetConfigAsync(
      terminal: ITerminal,
      buildFolderPath: string,
      rigConfig: HeftConfiguration['rigConfig']
    ): Promise<IStaticAssetTypingsConfigurationJson | undefined> {
      return getConfigFromConfigFileAsync(configFileName, terminal, buildFolderPath, rigConfig);
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
      if (cjsOutputFolders.length) {
        const outputSource: string = [
          `"use strict"`,
          `Object.defineProperty(exports, "__esModule", { value: true });`,
          `var content = ${stringifiedContents};`,
          `exports.default = content;`
        ].join('\n');
        const outputBuffer: Buffer = Buffer.from(outputSource);
        for (const folder of cjsOutputFolders) {
          outputs.set(`${folder}/${relativePath}.js`, outputBuffer);
        }
      }

      if (esmOutputFolders.length) {
        const outputSource: string = [
          `const content = ${stringifiedContents};`,
          `export default content;`
        ].join('\n');
        const outputBuffer: Buffer = Buffer.from(outputSource);
        for (const folder of esmOutputFolders) {
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
      tryGetConfigAsync,
      slashNormalizedBuildFolderPath,
      getAdditionalOutputFiles,
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
