/* Top-level scope code samples */
// scope: '.', target: '.'
let exampleString: string = 5 + '';

const exampleObject = {
  exampleString: exampleString
};

/* Function scope code samples */
export function exampleFunction() {
  const {}: Object = exampleObject;

  // scope: '.FunctionDeclaration', target: '.exampleFunction'
  !!!exampleString as Boolean;
}

// scope: '.ArrowFunctionExpression', target: '.x'
export const x = () => {},
  // scope: '.ArrowFunctionExpression', target: '.y'
  y = () => {},
  // scope: '.ArrowFunctionExpression', target: '.z'
  z = () => {};

/* Class scope code samples */
export class ExampleClass {
  // scope: '.ClassDeclaration', target: '.ExampleClass'
  exampleClassProperty: String = exampleString + '4';

  exampleMethod() {
    // scope: '.ClassDeclaration.MethodDefinition', target: '.exampleClass.exampleMethod'
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

  // scope: '.ClassExpression.MethodDefinition', target: '.exampleAnonymousClass.constructor'
  constructor() {}

  set exampleSetGet(val: string) {
    // scope: '.ClassExpression.MethodDefinition', target: '.exampleAnonymousClass.exampleSetGet'
    let exampleVariable: Number = 1;
    this.exampleClassProperty = val + exampleVariable;
  }

  get exampleSetGet() {
    // scope: '.ClassExpression.MethodDefinition', target: '.exampleAnonymousClass.exampleSetGet'
    return this.exampleClassProperty as String as string;
  }
};

/* Object property and method code samples */
export const exampleObject2 = {
  // scope: '.ObjectExpression.ArrowFunctionExpression', target: '.exampleObject2.exampleObjectProperty
  exampleObjectProperty: () => {},

  exampleObjectMethod() {
    // scope: '.ObjectExpression.MethodDefinition', target: '.exampleObject2.exampleObjectMethod'
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
          // scope: '.ClassDeclaration.MethodDefinition.ClassExpression.MethodDefinition.VariableDeclarator.Property'
          // target: '.AbsurdClass.absurdClassMethod.AbsurdClass2.constructor.absurdObject.absurdObjectMethod'
          absurdObjectMethod() {}
        };
        this.absurdClassProperty = absurdObject;
      }
    };
  }
}

/* Type, interface, enum code samples */
export type ExampleObjectType = {
  // scope: '.TSTypeAliasDeclaration', target: '.ExampleObjectType'
  examplePropertyType: String;
};

// scope: '.TSInterfaceDeclaration', target: '.ExampleInterface'
export interface ExampleInterface {}

export enum ExampleEnum {
  A = 0,

  B = 1,

  C = 'exampleStringValue'['length'],

  D = 1
}

/* Namespace, declare, module code samples */
// scope: '.TSModuleDeclaration', target: '.ExampleModule'
export namespace ExampleModule {
  // scope: '.TSModuleDeclaration.TSInterfaceDeclaration', target: '.ExampleModule.ExampleInterface2'
  export interface ExampleInterface2 {}
}
