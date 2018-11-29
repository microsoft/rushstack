// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const unexportedCustomSymbol: unique symbol = Symbol('unexportedCustomSymbol');
export const locallyExportedCustomSymbol: unique symbol = Symbol('locallyExportedCustomSymbol');

/** @public */
export const fullyExportedCustomSymbol: unique symbol = Symbol('fullyExportedCustomSymbol');

/**
 * @public
 */
export class ClassWithSymbols {
  public readonly [unexportedCustomSymbol]: number = 123;

  public get [locallyExportedCustomSymbol](): string {
    return 'hello';
  }

  public [fullyExportedCustomSymbol](): void {
  }
}
