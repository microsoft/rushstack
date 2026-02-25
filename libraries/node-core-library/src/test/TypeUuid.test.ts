// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TypeUuid } from '../TypeUuid.ts';

const UuidA: string = '122f9816-15c2-480f-8c12-ed94d586b653';
const UuidC: string = 'db7dae9b-38d2-4a0a-a62f-ac6b71c2c575';

describe(TypeUuid.name, () => {
  it('correctly identifies types with inheritance', () => {
    class A {}
    class B extends A {}

    class C extends B {
      public constructor(x: number) {
        super();
      }
    }

    TypeUuid.registerClass(A, UuidA);
    TypeUuid.registerClass(C, UuidC);

    const a: A = new A();
    const b: B = new B();
    const c: C = new C(123);

    expect(TypeUuid.isInstanceOf(a, UuidA)).toEqual(true);
    expect(TypeUuid.isInstanceOf(b, 'b205484a-fe48-4f40-bbd4-d7d46525637f')).toEqual(false);
    expect(TypeUuid.isInstanceOf(c, UuidC)).toEqual(true);
  });

  it('forbids multiple type assignments', () => {
    class A {}
    TypeUuid.registerClass(A, UuidA);
    expect(() => TypeUuid.registerClass(A, UuidC)).toThrow(/already registered/);
  });

  it('handles undefined and null', () => {
    expect(TypeUuid.isInstanceOf(undefined, UuidA)).toEqual(false);
    expect(TypeUuid.isInstanceOf(null, UuidA)).toEqual(false);
  });

  it('works with Symbol.hasInstance', () => {
    const uuidQ: string = 'c9d85505-40de-4553-8da2-6604dccdc65f';

    class Q {
      public static [Symbol.hasInstance](instance: object): boolean {
        return TypeUuid.isInstanceOf(instance, uuidQ);
      }
    }
    class Q2 {
      public static [Symbol.hasInstance](instance: object): boolean {
        return TypeUuid.isInstanceOf(instance, uuidQ);
      }
    }

    TypeUuid.registerClass(Q, uuidQ);
    TypeUuid.registerClass(Q2, uuidQ);

    const q: Q2 = new Q2();
    expect(q instanceof Q).toEqual(true);
  });
});
