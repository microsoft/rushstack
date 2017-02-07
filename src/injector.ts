/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

import { EOL } from 'os';
import * as path from 'path';

import { ISetWebpackPublicPathLoaderOptions } from './SetWebpackPublicPathLoader';

export = function(source: string): string { // tslint:disable-line:export-name no-function-expression
  const options: ISetWebpackPublicPathLoaderOptions = this.query || {};
  const serializedOptions: string = Object.keys(options).map(key => `${key}=${options[key]}`).join('&');
  const loaderPath: string = path.join(__dirname, 'index.js').replace(/\\/g, '\\\\');
  return [
    `require('${loaderPath}?${serializedOptions}!');`,
    '',
    source
  ].join(EOL);
}
