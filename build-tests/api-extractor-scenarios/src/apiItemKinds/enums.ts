// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export enum RegularEnum {
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
  Two = RegularEnum.One + 1
}

/** @public */
export const enum ConstEnum {
  Zero,
  One = 1,
  Two = RegularEnum.One + 1
}
