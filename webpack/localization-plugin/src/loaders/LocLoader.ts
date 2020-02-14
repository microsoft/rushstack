// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { loader } from 'webpack';

import { LocalizationPlugin } from '../LocalizationPlugin';
import { ILocalizationFile } from '../interfaces';
import { LocFileParser } from '../utilities/LocFileParser';
import {
  loaderFactory,
  IBaseLoaderOptions
} from './LoaderFactory';
import { EntityMarker } from '../utilities/EntityMarker';

export interface ILocLoaderOptions extends IBaseLoaderOptions {
  pluginInstance: LocalizationPlugin;
}

export default loaderFactory(
  function (
    this: loader.LoaderContext,
    locFilePath: string,
    content: string,
    options: ILocLoaderOptions
  ) {
    const { pluginInstance } = options;
    const locFileData: ILocalizationFile = LocFileParser.parseLocFileFromLoader(content, this);
    pluginInstance.addDefaultLocFile(locFilePath, locFileData);

    const resultObject: { [stringName: string]: string } = {};
    for (const stringName in locFileData) { // eslint-disable-line guard-for-in
      const stringKey: string = `${locFilePath}?${stringName}`;
      if (pluginInstance.stringKeys.has(stringKey)) {
        resultObject[stringName] = pluginInstance.stringKeys.get(stringKey)!.value;
      } else {
        throw new Error(`Unexpected - missing placeholder for string key "${stringKey}"`);
      }
    }

    EntityMarker.markEntity(this._module, true);

    return resultObject;
  }
);
