// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import type { IHeftPlugin, IHeftTaskSession, HeftConfiguration } from '@rushstack/heft';
import { TypingsGenerator } from '@rushstack/typings-generator';

export type FileExtension = `.${string}`;

const PLUGIN_NAME: string = 'image-typings-generator';
const DEFAULT_FILE_EXTENSIONS: FileExtension[] = ['.png', '.jpg', '.jpeg', '.gif', '.svg'];

export interface IImageTypingsGeneratorHeftPluginOptions {
  fileExtensions?: FileExtension[];
  generatedTsFolder: string;
  srcFolder?: string;
}

export default class ImageTypingsGeneratorPlugin
  implements IHeftPlugin<IHeftTaskSession, IImageTypingsGeneratorHeftPluginOptions>
{
  public apply(
    heftSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IImageTypingsGeneratorHeftPluginOptions
  ): void {
    const {
      logger: { terminal }
    } = heftSession;
    const { buildFolderPath } = heftConfiguration;
    const { fileExtensions = DEFAULT_FILE_EXTENSIONS, generatedTsFolder, srcFolder = 'src' } = options;

    const typingsGenerator: TypingsGenerator = new TypingsGenerator({
      fileExtensions,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      readFile: async (filePath: string) => '',
      srcFolder: path.resolve(buildFolderPath, srcFolder),
      generatedTsFolder: path.resolve(buildFolderPath, generatedTsFolder),
      parseAndGenerateTypings: () => 'declare const imageUrl: string;\nexport default imageUrl;',
      terminal
    });

    heftSession.hooks.run.tapPromise(PLUGIN_NAME, async () => {
      await typingsGenerator.generateTypingsAsync();
    });
  }
}
