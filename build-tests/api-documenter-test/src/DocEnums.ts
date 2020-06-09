// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Docs for DocEnum
 * @public
 * {@docCategory SystemEvent}
 */
export enum DocEnum {
  /**
   * These are some docs for Zero
   */
  Zero,

  /**
   * These are some docs for One
   */
  One = 1,

  /**
   * These are some docs for Two
   */
  Two = DocEnum.One + 1,
}
