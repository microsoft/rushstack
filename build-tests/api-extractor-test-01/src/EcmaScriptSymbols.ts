// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference lib="es2015.symbol.wellknown" />

const unexportedCustomSymbol: unique symbol = Symbol('unexportedCustomSymbol');
export const locallyExportedCustomSymbol: unique symbol = Symbol('locallyExportedCustomSymbol');

/** @public */
export const fullyExportedCustomSymbol: unique symbol = Symbol('fullyExportedCustomSymbol');

// NOTE: named 'ANamespace' so that it appears earlier in the rollup .d.ts file, due to
// https://github.com/microsoft/TypeScript/issues/31746
/** @public */
export namespace ANamespace {
  export const locallyExportedCustomSymbol: unique symbol = Symbol('locallyExportedCustomSymbol');

  /** @public */
  export const fullyExportedCustomSymbol: unique symbol = Symbol('fullyExportedCustomSymbol');
}

/**
 * @public
 */
export class ClassWithSymbols {
  public readonly [unexportedCustomSymbol]: number = 123;

  public get [locallyExportedCustomSymbol](): string {
    return 'hello';
  }

  public [fullyExportedCustomSymbol](): void {}

  public get [ANamespace.locallyExportedCustomSymbol](): string {
    return 'hello';
  }

  public [ANamespace.fullyExportedCustomSymbol](): void {}

  public get [Symbol.toStringTag](): string {
    return 'ClassWithSymbols';
  }
}
