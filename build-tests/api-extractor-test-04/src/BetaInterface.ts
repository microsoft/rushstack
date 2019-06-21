// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This is a beta interface
 * @beta
 */
export interface BetaInterface {
  /**
   * This is a comment
   */
  undecoratedMember(): void;

  /**
   * This is an alpha comment
   * @alpha
   */
  alphaMember(): void;

  /**
   * This is an internal member
   * @internal
   */
  _internalMember(): void;
}
