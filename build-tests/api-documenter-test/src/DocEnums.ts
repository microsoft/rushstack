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
   * These are some docs for Two.
   *
   * {@link DocEnum.One} is a direct link to another enum member.
   */
  Two = DocEnum.One + 1
}

/**
 * Enum that merges with namespace
 *
 * @remarks
 * {@link (DocEnumNamespaceMerge:enum)|Link to enum}
 *
 * {@link (DocEnumNamespaceMerge:namespace)|Link to namespace}
 *
 * {@link (DocEnumNamespaceMerge:namespace).exampleFunction|Link to function inside namespace}
 *
 * @public
 */
export enum DocEnumNamespaceMerge {
  /**
   * These are some docs for Left
   */
  Left = 0,

  /**
   * These are some docs for Right
   */
  Right = 1
}

/**
 * Namespace that merges with enum
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace DocEnumNamespaceMerge {
  /**
   * This is a function inside of a namespace that merges with an enum.
   */
  export function exampleFunction(): void {}
}
