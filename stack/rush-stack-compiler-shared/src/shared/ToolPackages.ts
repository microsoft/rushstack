// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as typescript from 'typescript';
import * as tslint from 'tslint';
import * as apiExtractor from '@microsoft/api-extractor';

/**
 * Provides access to the raw tool APIs.
 *
 * @alpha
 */
export class ToolPackages {
  public static typescript: typeof typescript = typescript;
  public static tslint: typeof tslint = tslint;
  public static apiExtractor: typeof apiExtractor = apiExtractor;
}
