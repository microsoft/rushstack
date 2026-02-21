// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { loader } from 'webpack';

import { Terminal } from '@rushstack/terminal';
import { type ILocalizationFile, parseLocFile } from '@rushstack/localization-utilities';

import type { LocalizationPlugin } from '../LocalizationPlugin.ts';
import { loaderFactory, type IBaseLoaderOptions } from './LoaderFactory.ts';
import { EntityMarker } from '../utilities/EntityMarker.ts';
import { LoaderTerminalProvider } from '../utilities/LoaderTerminalProvider.ts';

export interface ILocLoaderOptions extends IBaseLoaderOptions {
  pluginInstance: LocalizationPlugin;
}

export default loaderFactory(function (
  this: loader.LoaderContext,
  locFilePath: string,
  content: string,
  options: ILocLoaderOptions
) {
  const { pluginInstance } = options;
  const terminal: Terminal = new Terminal(LoaderTerminalProvider.getTerminalProviderForLoader(this));
  const locFileData: ILocalizationFile = parseLocFile({
    ...options,
    content,
    terminal,
    filePath: locFilePath
  });
  const { additionalLoadedFilePaths, errors } = pluginInstance.addDefaultLocFile(
    terminal,
    locFilePath,
    locFileData
  );
  for (const additionalFile of additionalLoadedFilePaths) {
    this.dependency(additionalFile);
  }

  for (const error of errors) {
    this.emitError(error);
  }

  const resultObject: { [stringName: string]: string } = {};
  // eslint-disable-next-line guard-for-in
  for (const stringName in locFileData) {
    const stringKey: string = `${locFilePath}?${stringName}`;
    if (pluginInstance.stringKeys.has(stringKey)) {
      resultObject[stringName] = pluginInstance.stringKeys.get(stringKey)!.value;
    } else {
      throw new Error(`Unexpected - missing placeholder for string key "${stringKey}"`);
    }
  }

  EntityMarker.markEntity(this._module, true);

  return resultObject;
});
