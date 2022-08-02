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
