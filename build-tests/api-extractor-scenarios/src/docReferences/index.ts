// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @public
 */
export namespace MyNamespace {
  export class MyClass {
    /**
     * Summary for myMethod
     * @remarks
     * Remarks for myMethod
     * @param x - the parameter
     * @returns a number
     * @beta
     */
    public myMethod(x: number): number {
      return x;
    }
  }
}

/**
 * {@inheritDoc MyNamespace.MyClass.myMethod}
 * @privateRemarks
 * The MyClass.myMethod documentation content will get copied,
 * but its `@beta` tag will not get copied.
 * @public
 */
export function testSimple(): void {
}

/**
 * {@inheritDoc MyNamespace.MyClass.nonExistentMethod}
 * @public
 */
export function failWithBrokenLink(): void {
}

/**
 * {@inheritDoc}
 * @public
 */
export function failWithMissingReference(): void {
}
