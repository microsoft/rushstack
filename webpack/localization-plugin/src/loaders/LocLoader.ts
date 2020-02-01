// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { loader } from 'webpack';
import * as loaderUtils from 'loader-utils';

import { LocalizationPlugin } from '../LocalizationPlugin';
import { ILocFile } from '../interfaces';
import { LocFileParser } from '../utilities/LocFileParser';

export interface ILocLoaderOptions {
  pluginInstance: LocalizationPlugin;
}

export default function (this: loader.LoaderContext, content: string): string {
  const { pluginInstance } = loaderUtils.getOptions(this) as ILocLoaderOptions;
  const locFilePath: string = this.resourcePath;
  const locFileData: ILocFile = LocFileParser.parseLocFile({
    filePath: locFilePath,
    loggerOptions: { writeError: this.emitError, writeWarning: this.emitWarning },
    content
  });

  const resultObject: { [stringName: string]: string } = {};
  for (const stringName in locFileData) { // eslint-disable-line guard-for-in
    const stringKey: string = `${locFilePath}?${stringName}`;
    if (pluginInstance.stringKeys.has(stringKey)) {
      resultObject[stringName] = pluginInstance.stringKeys.get(stringKey)!.value;
    } else {
      this.emitError(new Error(
        `String "${stringName}" in file ${locFilePath} was not provided in the LocalizationPlugin configuration.`
      ));
    }
  }

  return JSON.stringify(resultObject);
}
