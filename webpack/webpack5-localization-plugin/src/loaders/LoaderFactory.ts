// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LoaderContext, LoaderDefinitionFunction } from 'webpack';

import type { ILocalizationFile } from '@rushstack/localization-utilities';

import { getPluginInstance, type LocalizationPlugin } from '../LocalizationPlugin.ts';

export interface IBaseLocLoaderOptions {
  ignoreString?: (key: string) => boolean;
}

export function createLoader<T extends IBaseLocLoaderOptions>(
  parseFile: (content: string, filePath: string, context: LoaderContext<T>) => ILocalizationFile
): LoaderDefinitionFunction<T> {
  // eslint-disable-next-line func-style
  const loader: LoaderDefinitionFunction<T> = async function (
    this: LoaderContext<T>,
    content: string
  ): Promise<string> {
    const locFilePath: string = this.resourcePath;

    const pluginInstance: LocalizationPlugin = getPluginInstance(this._compiler);

    const locFileData: ILocalizationFile = parseFile(content, locFilePath, this);

    const strings: Record<string, string> = await pluginInstance.addDefaultLocFileAsync(
      this,
      locFilePath,
      locFileData
    );

    const { type } = this._module!;

    switch (type) {
      case 'json':
        return JSON.stringify(strings);
      case 'javascript/auto':
      case 'javascript/esm':
        return `const strings = ${JSON.stringify(strings)};\nexport default strings;`;
      default:
        this.emitError(new Error(`Unexpected localized module type ${type} for module ${this.resourcePath}`));
        return '';
    }
  };

  return loader;
}
