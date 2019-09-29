// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export namespace A {
  export class B {
    public myMethod(): void {
    }
  }
}

export interface A {
  myProperty: string;
}

/**
 * {@link MyNamespace.MyClass.myMethod | the method}
 * @public
 */
export function failWithAmbiguity() {
}

/**
 * {@link (A:namespace).B.myMethod | the method}
 * {@link (A:interface).myProperty | the property}
 * @public
 */
export function succeedWithSelector() {
}

/**
 * NOTE: The broken link checker currently is not able to validate references to external packages.
 * Tracked by:  https://github.com/microsoft/rushstack/issues/1195
 * {@link nonexistent#nonexistent}
 * @public
 */
export function succeedWithExternalReference(): void {
}
