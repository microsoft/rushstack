// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * api-extractor-test-05
 *
 * This project tests various documentation generation scenarios and
 * doc comment syntaxes.
 *
 * @packageDocumentation
 */

// eslint-disable-next-line no-restricted-syntax
export * from './DocClass1.ts';
// eslint-disable-next-line no-restricted-syntax
export * from './DocEnums.ts';
import type { IDocInterface1, IDocInterface3, SystemEvent } from './DocClass1.ts';

export { DecoratorExample } from './DecoratorExample.ts';

export { AbstractClass } from './AbstractClass.ts';

/**
 * A type alias
 * @public
 */
export type ExampleTypeAlias = Promise<boolean>;

/**
 * A type alias that references multiple other types.
 * @public
 */
export type ExampleUnionTypeAlias = IDocInterface1 | IDocInterface3;

/**
 * A type alias that has duplicate references.
 * @public
 */
export type ExampleDuplicateTypeAlias = SystemEvent | typeof SystemEvent;

/**
 * An exported variable declaration.
 * @public
 */
export const constVariable: number = 123;

/**
 * An exported function with hyperlinked parameters and return value.
 *
 * @param x - an API item that should get hyperlinked
 * @param y - a system type that should NOT get hyperlinked
 * @returns an interface that should get hyperlinked
 * @public
 */
export function exampleFunction(x: ExampleTypeAlias, y: number): IDocInterface1 {
  return undefined as unknown as IDocInterface1;
}

/**
 * A top-level namespace
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace OuterNamespace {
  /**
   * A nested namespace
   */
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace InnerNamespace {
    /**
     * A function inside a namespace
     */
    export function nestedFunction(x: number): number {
      return x;
    }
  }

  /**
   * A variable exported from within a namespace.
   */
  // eslint-disable-next-line prefer-const
  export let nestedVariable: boolean = false;
}

/**
 * @public
 */
export declare function yamlReferenceUniquenessTest(): IDocInterface1;

/**
 * @public
 */
export type TypeAlias = number;

/**
 * @public
 */
export type GenericTypeAlias<T> = T[];
