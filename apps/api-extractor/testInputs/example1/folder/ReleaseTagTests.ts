// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This is an alpha class.
 * @alpha
 */
export class AlphaTaggedClass {
  /**
   * This is an internal method.
   * @internal
   */
  public _internalMethod(): void {
  }

  /**
   * This is a plain method.
   */
  public plainMethod(): void {
  }
}

/**
 * This is a beta class.
 * @beta
 */
export class BetaTaggedClass {
  /**
   * This is an internal method.
   * @internal
   */
  public _internalMethod(): void {
  }

  /**
   * This is a plain method.
   */
  public plainMethod(): void {
  }

  /**
   * This is an alpha method.
   * @alpha
   */
  public alphaMethod(): void {
  }

  /**
   * This internal method should have an underscore.
   * @internal
   */
  public internalMethodMissingUnderscore(): void {
  }

  /**
   * This alpha method should have an underscore.
   * @alpha
   */
  public _alphaMethodWithBadUnderscore(): void {
  }
}

/**
 * This is a public class.
 * @public
 */
export class PublicTaggedClass {
  /**
   * This is an internal method.
   * @internal
   */
  public _internalMethod(): void {
  }

  /**
   * This is a plain method.
   */
  public plainMethod(): void {
  }

  /**
   * This is an alpha method.
   * @alpha
   */
  public alphaMethod(): void {
  }

  /**
   * This is an alpha method.
   * @beta
   */
  public betaMethod(): void {
  }
}
