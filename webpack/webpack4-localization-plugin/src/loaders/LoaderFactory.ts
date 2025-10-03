// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { loader } from 'webpack';
import * as loaderUtils from 'loader-utils';

import type { NewlineKind } from '@rushstack/node-core-library';
import type { IgnoreStringFunction } from '@rushstack/localization-utilities';

export interface IBaseLoaderOptions {
  resxNewlineNormalization: NewlineKind | undefined;
  ignoreMissingResxComments: boolean | undefined;
  ignoreString: IgnoreStringFunction | undefined;
}

export interface ILoaderResult {
  [stringName: string]: string;
}

export function loaderFactory<TOptions extends IBaseLoaderOptions>(
  innerLoader: (locFilePath: string, content: string, options: TOptions) => ILoaderResult
): loader.Loader {
  return function (this: loader.LoaderContext, content: string | Buffer): string {
    const options: TOptions = loaderUtils.getOptions(this) as TOptions;
    if (typeof content !== 'string') {
      content = content.toString();
    }

    const resultObject: ILoaderResult = innerLoader.call(this, this.resourcePath, content, options);
    return JSON.stringify(resultObject);
  };
}
