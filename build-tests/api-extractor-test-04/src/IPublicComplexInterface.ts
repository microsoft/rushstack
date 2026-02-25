// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IPublicClassInternalParameters } from './PublicClass.ts';

/**
 * This is a public class
 * @public
 */
export interface IPublicComplexInterface {
  /**
   * Example of trimming an indexer.
   * @internal
   */
  [key: string]: IPublicClassInternalParameters;

  /**
   * Example of trimming a construct signature.
   * @internal
   */
  new ();
}
