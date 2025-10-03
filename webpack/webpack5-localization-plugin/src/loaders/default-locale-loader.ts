// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LoaderContext, LoaderDefinitionFunction } from 'webpack';

import { Terminal } from '@rushstack/terminal';
import { type ILocalizationFile, parseLocFile } from '@rushstack/localization-utilities';

import type { IResxLoaderOptions } from './IResxLoaderOptions';
import { LoaderTerminalProvider } from '../utilities/LoaderTerminalProvider';

/**
 * This loader passes through the raw untranslated strings and may be used without a LocalizationPlugin instance.
 */
// eslint-disable-next-line func-style
const loader: LoaderDefinitionFunction<IResxLoaderOptions> = function (
  this: LoaderContext<IResxLoaderOptions>,
  content: string
): string {
  const options: IResxLoaderOptions = this.getOptions();

  const locFileData: ILocalizationFile = parseLocFile({
    ...options,
    content,
    filePath: this.resourcePath,
    terminal: new Terminal(LoaderTerminalProvider.getTerminalProviderForLoader(this))
  });

  const resultObject: { [stringName: string]: string } = {};
  for (const [stringName, stringValue] of Object.entries(locFileData)) {
    resultObject[stringName] = stringValue.value;
  }

  return JSON.stringify(resultObject);
};

export default loader;
