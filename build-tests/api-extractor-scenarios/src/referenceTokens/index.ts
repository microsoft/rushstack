// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Lib2Class } from 'api-extractor-lib2-test';
import { SomeClass5 } from './internal.ts';

/**
 * Various namespace scenarios.
 * @public
 */
export namespace n1 {
  type SomeType1 = number;
  export function someFunction1(): SomeType1 {
    return 5;
  }

  export namespace n2 {
    type SomeType2 = number;
    export function someFunction2(): SomeType2 {
      return 5;
    }

    export namespace n3 {
      export type SomeType3 = number;
      export function someFunction3(): n2.n3.SomeType3 {
        return 5;
      }
    }

    namespace n4 {
      export type SomeType4 = number;
      export function someFunction4(): n4.SomeType4 {
        return 5;
      }
    }
  }
}

/** @public */
export enum SomeEnum {
  A = 'A',
  B = 'B',
  C = 'C'
}

/**
 * Enum member reference.
 * @public
 */
export function someFunction5(): SomeEnum.A {
  return SomeEnum.A;
}

/** @public */
export class SomeClass1 {
  public static staticProp = 5;
}

/**
 * Static class member reference.
 * @public
 */
export function someFunction6(): typeof SomeClass1.staticProp {
  return 5;
}

/** @public */
export interface SomeInterface1 {
  prop: number;
}

/**
 * Interface member reference.
 * @public
 */
export function someFunction9({ prop: prop2 }: SomeInterface1): void {}

class SomeClass2 {}

/**
 * Unexported symbol reference.
 * @public
 */
export class SomeClass3 extends SomeClass2 {}

/**
 * Global symbol reference.
 * @public
 */
export function someFunction7({ then: then2 }: Promise<void>): typeof Date.prototype.getDate {
  return () => 5;
}

/**
 * External symbol reference.
 * @public
 */
export function someFunction8({ prop: prop2 }: Lib2Class): void {}

/**
 * Reference to a symbol exported from another file, but not exported from the package.
 * @public
 */
export class SomeClass4 extends SomeClass5 {}

/** @public */
export const SomeSymbol1 = Symbol('ThisIsSomeSymbol1');
/** @public */
export const SomeVar1 = 'ThisIsSomeVar1';
/**
 * References to computed properties.
 * @public
 */
export interface SomeInterface1 {
  [SomeVar1]: () => string;
  [SomeSymbol1]: () => string;
}
