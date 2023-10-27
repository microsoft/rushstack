// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* Top-level scope code samples */
// scopeId: '.'
let exampleString: string = 5 + '';

const exampleObject = {
  exampleString: exampleString
};

/* Function scope code samples */
export function exampleFunction() {
  const {}: Object = exampleObject;

  // scopeId: '.exampleFunction'
  !!!exampleString as Boolean;
}

// scope: '.ArrowFunctionExpression',
export const x = () => {},
  // scopeId: '.y'
  y = () => {},
  // scopeId: '.z'
  z = () => {};

/* Class scope code samples */
export class ExampleClass {
  // scopeId: '.ExampleClass'
  exampleClassProperty: String = exampleString + '4';

  exampleMethod() {
    // scopeId: '.exampleClass.exampleMethod'
    var exampleVar;
    return exampleVar;
  }
}

/* Variable and anonymous constructs code samples */
export const exampleArrowFunction = () => {
  const exampleBoolean = true;
  if (exampleBoolean) {
  }

  exampleObject['exampleString'];
};

export const exampleAnonymousClass = class {
  exampleClassProperty = 'x' + 'y';

  // scopeId: '.exampleAnonymousClass.constructor'
  constructor() {}

  set exampleSetGet(val: string) {
    // scopeId: '.exampleAnonymousClass.exampleSetGet'
    let exampleVariable: Number = 1;
    this.exampleClassProperty = val + exampleVariable;
  }

  get exampleSetGet() {
    // scopeId: '.exampleAnonymousClass.exampleSetGet'
    return this.exampleClassProperty as String as string;
  }
};
