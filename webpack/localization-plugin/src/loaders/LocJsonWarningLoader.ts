// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { loader } from 'webpack';

export default function (this: loader.LoaderContext, content: string): string {
  const locJsonFilePath: string = this.resourcePath;
  this.emitError(new Error(
    `${locJsonFilePath} appears to be a .loc.json file, but wasn't provided data and wasn't ` +
    'listed in the LocalizationPlugin configuration\'s filesToIgnore property.'
  ));

  return content;
}
