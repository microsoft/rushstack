// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * These are internal constructor parameters for PublicClass's internal constructor.
 * @internal
 */
export interface IPublicClassInternalParameters {}

/**
 * This is a public class
 * @public
 */
export class PublicClass {
  /** @internal */
  constructor(parameters: IPublicClassInternalParameters) {}

  /**
   * This is a beta field
   * @beta
   */
  public betaField: string = 'hello';

  /**
   * This is a comment
   */
  public undecoratedMember(): void {}

  /**
   * This is a beta comment
   * @beta
   */
  public betaMember(): void {}

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
