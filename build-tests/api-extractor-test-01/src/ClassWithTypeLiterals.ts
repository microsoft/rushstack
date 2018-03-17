// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This class illustrates some cases involving type literals.
 * @public
 */
export class ClassWithTypeLiterals {
  /** type literal in  */
  public method1(vector: { x :number, y :number}): void {
  }

  /** type literal output  */
  public method2(): { classValue: ClassWithTypeLiterals, callback: () => number } | undefined {
    return undefined;
  }
}
