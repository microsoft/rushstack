// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { loader } from 'webpack';
import { Terminal } from '@rushstack/node-core-library';

import { IStringPlaceholder, LocalizationPlugin } from '../LocalizationPlugin';
import { ILocalizationFile } from '../interfaces';
import { LocFileParser } from '../utilities/LocFileParser';
import { loaderFactory, IBaseLoaderOptions } from './LoaderFactory';
import { LoaderTerminalProvider } from '../utilities/LoaderTerminalProvider';

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
  const locFileData: ILocalizationFile = LocFileParser.parseLocFile({
    content,
    terminal,
    filePath: locFilePath,
    resxNewlineNormalization: options.resxNewlineNormalization
  });

  const { additionalLoadedFilePaths, errors } = pluginInstance.addDefaultLocFile(
    terminal,
    locFilePath,
    locFileData,
    this._module
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
    const placeholder: IStringPlaceholder | undefined = pluginInstance.getPlaceholder(
      locFilePath,
      stringName
    );
    if (placeholder) {
      resultObject[stringName] = placeholder.value;
    } else {
      throw new Error(
        `Unexpected - missing placeholder for string named "${stringName}" in file "${locFilePath}"`
      );
    }
  }

  // Entity marking handled inside of addDefaultLocFile

  return resultObject;
});
