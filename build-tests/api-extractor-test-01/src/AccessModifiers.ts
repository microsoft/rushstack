// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This class gets aliased twice before being exported from the package.
 * @public
 */
export class ClassWithAccessModifiers {
  /** Doc comment */
  private _privateField: number = 123;

  /** Doc comment */
  private privateMethod(): void {
  }

  /** Doc comment */
  private get privateGetter(): string {
    return '';
  }

  /** Doc comment */
  private privateSetter(x: string) {
  }

  /** Doc comment */
  private constructor() {
  }

  /** Doc comment */
  private static privateStaticMethod() {
  }


  /** Doc comment */
  protected protectedField: number;

  /** Doc comment */
  protected get protectedGetter(): string {
    return '';
  }

  /** Doc comment */
  protected protectedSetter(x: string) {
  }

  /** Doc comment */
  public static publicStaticField: number = 123;

  /** Doc comment */
  defaultPublicMethod(): void {
  }
}
