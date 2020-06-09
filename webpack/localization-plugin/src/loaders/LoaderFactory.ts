// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { loader } from 'webpack';
import * as loaderUtils from 'loader-utils';
import { NewlineKind } from '@rushstack/node-core-library';

export interface IBaseLoaderOptions {
  resxNewlineNormalization: NewlineKind | undefined;
}

export interface ILoaderResult {
  [stringName: string]: string;
}

export function loaderFactory<TOptions extends IBaseLoaderOptions>(
  innerLoader: (locFilePath: string, content: string, options: TOptions) => ILoaderResult
): loader.Loader {
  return function (this: loader.LoaderContext, content: string): string {
    const options: TOptions = loaderUtils.getOptions(this) as TOptions;
    const resultObject: ILoaderResult = innerLoader.call(this, this.resourcePath, content, options);
    return JSON.stringify(resultObject);
  };
}
