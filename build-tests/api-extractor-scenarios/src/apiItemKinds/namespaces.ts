/** @public */
export namespace n1 {
  class SomeClass1 {}
  export class SomeClass2 extends SomeClass1 {}

  export namespace n2 {
    export class SomeClass3 {}
  }
}

/** @public */
export namespace n1 {
  export class SomeClass4 {}
}

/** @public */
type SomeType = string;
export { SomeType as SomeOtherType };

/** @public */
export declare namespace n2 {
  const name2: SomeType;
  export { SomeType, type SomeType as YetAnotherType, type name2 };
}
