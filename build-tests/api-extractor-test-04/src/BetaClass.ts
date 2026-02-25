// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BetaInterface } from './BetaInterface.ts';

/**
 * This is a beta class
 * @beta
 */
export class BetaClass implements BetaInterface {
  /**
   * This is a comment
   */
  public undecoratedMember(): void {}

  /**
   * This is an alpha comment
   * @alpha
   */
  public alphaMember(): void {}

  /**
   * This is an internal member
   * @internal
   */
  public _internalMember(): void {}
}
