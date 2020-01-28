// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { loader } from 'webpack';
import * as loaderUtils from 'loader-utils';
import * as jju from 'jju';

import { LocalizationPlugin } from '../LocalizationPlugin';
import { ILocJsonFile } from '../interfaces';

export interface ILocJsonLoaderOptions {
  pluginInstance: LocalizationPlugin;
}

export default function (this: loader.LoaderContext, content: string): string {
  const { pluginInstance } = loaderUtils.getOptions(this) as ILocJsonLoaderOptions;
  const locJsonFilePath: string = this.resourcePath;
  const locJsonFileData: ILocJsonFile = jju.parse(content);

  const resultObject: { [stringName: string]: string } = {};
  for (const stringName in locJsonFileData) { // eslint-disable-line guard-for-in
    const stringKey: string = `${locJsonFilePath}?${stringName}`;
    if (pluginInstance.stringKeys.has(stringKey)) {
      resultObject[stringName] = pluginInstance.stringKeys.get(stringKey)!.value;
    } else {
      this.emitError(new Error(
        `String "${stringName}" in file ${locJsonFilePath} was not provided in the LocalizationPlugin configuration.`
      ));
    }
  }

  return JSON.stringify(resultObject);
}
