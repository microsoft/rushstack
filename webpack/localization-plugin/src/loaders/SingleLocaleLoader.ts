// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { loader } from 'webpack';
import * as loaderUtils from 'loader-utils';
import * as jju from 'jju';

import { ILocFile } from '../interfaces';
import { Constants } from '../utilities/Constants';
import { ResxReader } from '../utilities/ResxReader';
import { Logging } from '../utilities/Logging';

export interface ISingleLocaleLoaderOptions {
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
  } = loaderUtils.getOptions(this) as ISingleLocaleLoaderOptions;
  const locFilePath: string = this.resourcePath;
  const resultObject: { [stringName: string]: string } = {};

  const stringMap: Map<string, string> | undefined = resolvedStrings.get(locFilePath);
  if (!stringMap) {
    this.emitError(new Error(
      `Strings for file ${locFilePath} were not provided in the LocalizationPlugin configuration.`
    ));
  } else {
    let locJsonFileData: ILocFile;
    if (/\.resx$/i.test(locFilePath)) {
      locJsonFileData = ResxReader.readResxAsLocFile(
        content,
        {
          ...Logging.getLoggingFunctions({ writeError: this.emitError, writeWarning: this.emitWarning }),
          resxFilePath: locFilePath
        }
      );
    } else {
      locJsonFileData = jju.parse(content);
      try {
        Constants.LOC_JSON_SCHEMA.validateObject(locJsonFileData, locFilePath);
      } catch (e) {
        this.emitError(`The loc file is invalid. Error: ${e}`);
      }
    }

    for (const stringName in locJsonFileData) {
      if (!stringMap.has(stringName)) {
        this.emitError(new Error(
          `String "${stringName}" in file ${locFilePath} was not provided in the LocalizationPlugin configuration.`
        ));
      } else {
        resultObject[stringName] = passthroughLocale ? stringName : stringMap.get(stringName)!;
      }
    }
  }

  return JSON.stringify(resultObject);
}
