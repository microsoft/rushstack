// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @public */
export namespace n1 {
  type SomeType1 = number;

  export function someFunction1(): SomeType1 {
    return 5;
  }

  export namespace n2 {
    export type SomeType2 = number;

    export function someFunction2(): SomeType2 {
      return 5;
    }

    export function someFunction3(): n2.SomeType2 {
      return 5;
    }

    export namespace n3 {
      export type SomeType3 = number;

      export function someFunction4(): n2.n3.SomeType3 {
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

/** @public */
export function someFunction5(): SomeEnum.A {
  return SomeEnum.A;
}

/** @public */
export class SomeClass {
  public static staticProp = 5;
}

/** @public */
export function someFunction6(): typeof SomeClass.staticProp {
  return 5;
}
