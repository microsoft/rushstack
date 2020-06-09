// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This is a regular enum marked as \@beta
 * @beta
 */
export enum RegularEnum {
  /**
   * This member inherits its \@beta status from the parent
   */
  BetaMember = 100,

  /**
   * This member is marked as \@alpha
   * @alpha
   */
  AlphaMember,

  /**
   * This member is marked as \@internal
   * @internal
   */
  _InternalMember,
}

/**
 * This is a const enum marked as \@beta
 * @beta
 */
export const enum ConstEnum {
  /**
   * This member inherits its \@beta status from the parent
   */
  BetaMember2 = 'BetaMember2',

  /**
   * This member is marked as \@alpha
   * @alpha
   */
  AlphaMember = 'AlphaMember',

  /**
   * This member is marked as \@internal
   * @internal
   */
  _InternalMember = '_InternalMember',
}
