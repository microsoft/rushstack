// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { UuidTypeId } from '../UuidTypeId';

class A {}
const UuidA: string = '122f9816-15c2-480f-8c12-ed94d586b653';

class B extends A {}

class C extends B {
  public constructor(x: number) {
    super();
  }
}
const UuidC: string = 'db7dae9b-38d2-4a0a-a62f-ac6b71c2c575';

describe('UuidTypeId', () => {
  test('correctly identifies types with inheritance', () => {
    UuidTypeId.registerClass(A, UuidA);
    UuidTypeId.registerClass(C, UuidC);

    const a: A = new A();
    const b: B = new B();
    const c: C = new C(123);

    expect(UuidTypeId.isInstanceOf(a, UuidA)).toEqual(true);
    expect(UuidTypeId.isInstanceOf(b, 'b205484a-fe48-4f40-bbd4-d7d46525637f')).toEqual(false);
    expect(UuidTypeId.isInstanceOf(c, UuidC)).toEqual(true);
  });
  test('forbids multiple type assignments', () => {
    UuidTypeId.registerClass(A, UuidA);
    expect(UuidTypeId.registerClass(A, UuidC)).toThrowError('already been registered with UuidTypeId');
  });
  test('works with Symbol.hasInstance', () => {
    const uuidQ: string = 'c9d85505-40de-4553-8da2-6604dccdc65f';

    class Q {
      public static [Symbol.hasInstance](instance: object): boolean {
        return UuidTypeId.isInstanceOf(instance, uuidQ);
      }
    }
    class Q2 {
      public static [Symbol.hasInstance](instance: object): boolean {
        return UuidTypeId.isInstanceOf(instance, uuidQ);
      }
    }

    UuidTypeId.registerClass(Q, uuidQ);
    UuidTypeId.registerClass(Q2, uuidQ);

    const q: Q2 = new Q2();
    expect(q instanceof Q).toEqual(true);
  });
});
