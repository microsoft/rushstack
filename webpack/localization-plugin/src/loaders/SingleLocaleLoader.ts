// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { loader } from 'webpack';
import * as loaderUtils from 'loader-utils';
import * as jju from 'jju';

import { ILocJsonFile } from '../interfaces';

export interface ILocJsonLoaderOptions {
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

export default function (this: loader.LoaderContext, content: string): string {
  const {
    resolvedStrings,
    passthroughLocale
  } = loaderUtils.getOptions(this) as ILocJsonLoaderOptions;
  const locJsonFilePath: string = this.resourcePath;
  const normalizedLocJsonFilePath: string = locJsonFilePath.toUpperCase();

  const resultObject: { [stringName: string]: string } = {};

  const stringMap: Map<string, string> | undefined = resolvedStrings.get(normalizedLocJsonFilePath);
  if (!stringMap) {
    this.emitError(new Error(
      `Strings for file ${locJsonFilePath} were not provided in the LocalizationPlugin configuration.`
      ));
  } else {
    const locJsonFileData: ILocJsonFile = jju.parse(content);
    for (const stringName in locJsonFileData) {
      if (!stringMap.has(stringName)) {
        this.emitError(new Error(
          `String "${stringName}" in file ${locJsonFilePath} was not provided in the LocalizationPlugin configuration.`
        ));
      } else {
        resultObject[stringName] = passthroughLocale ? stringName : stringMap.get(stringName)!;
      }
    }
  }

  return JSON.stringify(resultObject);
}
