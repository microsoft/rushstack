// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { loader } from 'webpack';

import { ILocFile } from '../interfaces';
import { LocFileParser } from '../utilities/LocFileParser';
import {
  loaderFactory,
  IBaseLoaderOptions
} from './LoaderFactory';

export interface ISingleLocaleLoaderOptions extends IBaseLoaderOptions {
  /**
   * The outer map's keys are the resolved, uppercased file names.
   * The inner map's keys are the string identifiers and its values are the string values.
   */
  resolvedStrings: Map<string, Map<string, string>>;

  /**
   * If set to `true`, use the passthrough locale
   */
  passthroughLocale: boolean;
}

export default loaderFactory(
  function (
    this: loader.LoaderContext,
    locFilePath: string,
    content: string,
    options: ISingleLocaleLoaderOptions
  ) {
    const {
      resolvedStrings,
      passthroughLocale
    } = options;
    const resultObject: { [stringName: string]: string } = {};

    const stringMap: Map<string, string> | undefined = resolvedStrings.get(locFilePath);
    if (!stringMap) {
      this.emitError(new Error(
        `Strings for file ${locFilePath} were not provided in the LocalizationPlugin configuration.`
      ));
    } else {
      const locFileData: ILocFile = LocFileParser.parseLocFileFromLoader(content, this);

      for (const stringName in locFileData) {
        if (!stringMap.has(stringName)) {
          this.emitError(new Error(
            `String "${stringName}" in file ${locFilePath} was not provided in the LocalizationPlugin configuration.`
          ));
        } else {
          resultObject[stringName] = passthroughLocale ? stringName : stringMap.get(stringName)!;
        }
      }
    }

    return resultObject;
  }
);
