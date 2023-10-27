// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// /* Object property and method code samples */
export const exampleObject2 = {
  // scopeId: '.exampleObject2.exampleObjectProperty
  exampleObjectProperty: () => {},

  exampleObjectMethod() {
    // scopeId: '.exampleObject2.exampleObjectMethod'
    const exampleUndefined: undefined = undefined;
    return exampleUndefined;
  }
};

/* Absurd examples */
export class AbsurdClass {
  absurdClassMethod() {
    return class AbsurdClass2 {
      absurdClassProperty;
      constructor() {
        const absurdObject = {
          // scopeId: '.AbsurdClass.absurdClassMethod.AbsurdClass2.constructor.absurdObject.absurdObjectMethod'
          absurdObjectMethod() {}
        };
        this.absurdClassProperty = absurdObject;
      }
    };
  }
}

/* Type, interface, enum code samples */
export type ExampleObjectType = {
  // scopeId: '.ExampleObjectType'
  examplePropertyType: String;
};

// scopeId: '.ExampleInterface'
export interface ExampleInterface {}

export enum ExampleEnum {
  A = 0,

  B = 1,

  C = 'exampleStringValue'['length'],

  D = 1
}

/* Namespace, declare, module code samples */
// scopeId: '.ExampleModule'
export namespace ExampleModule {
  // scopeId: '.ExampleModule.ExampleInterface2'
  export interface ExampleInterface2 {}
}
