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

export * from './DocClass1';
export * from './DocEnums';
import { IDocInterface1 } from './DocClass1';

/**
 * A type alias
 * @public
 */
export type ExampleTypeAlias = Promise<boolean>;

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
  return (undefined as unknown) as IDocInterface1;
}

/**
 * A top-level namespace
 * @public
 */
export namespace OuterNamespace {
  /**
   * A nested namespace
   */
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
