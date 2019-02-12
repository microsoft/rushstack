// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as Typescript from 'typescript';
import * as Tslint from 'tslint';
import * as ApiExtractor from '@microsoft/api-extractor';

/**
 * @alpha
 */
export class ToolPackages {
  public static typescript: typeof Typescript = Typescript;
  public static tslint: typeof Tslint = Tslint;
  public static apiExtractor: typeof ApiExtractor = ApiExtractor;
}
