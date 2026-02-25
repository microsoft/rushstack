// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { loader } from 'webpack';

import { Terminal } from '@rushstack/terminal';
import { type ILocalizationFile, parseLocFile } from '@rushstack/localization-utilities';

import { loaderFactory, type IBaseLoaderOptions } from './LoaderFactory.ts';
import { LoaderTerminalProvider } from '../utilities/LoaderTerminalProvider.ts';

export default loaderFactory(function (
  this: loader.LoaderContext,
  locFilePath: string,
  content: string,
  options: IBaseLoaderOptions
) {
  const locFileData: ILocalizationFile = parseLocFile({
    ...options,
    content,
    filePath: locFilePath,
    terminal: new Terminal(LoaderTerminalProvider.getTerminalProviderForLoader(this))
  });
  const resultObject: { [stringName: string]: string } = {};
  for (const [stringName, stringValue] of Object.entries(locFileData)) {
    resultObject[stringName] = stringValue.value;
  }

  return resultObject;
});
