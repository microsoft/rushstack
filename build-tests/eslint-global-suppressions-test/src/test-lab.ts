// Top-level scope code samples
let exampleString = 5 + ''; // scopeId: "."

const exampleObject = {
  exampleString: exampleString
};

// Function scope code samples
function exampleFunction() {
  const {} = exampleObject; // scopeId: ".exampleFunction"

  !!!exampleString; // scopeId: ".exampleFunction"
}

// Class scope code samples
class ExampleClass {
  exampleClassProperty = exampleString + '4'; // scopeId: ".ExampleClass"

  exampleMethod() {
    '' + !!exampleString; // scopeId: "".ExampleClass.exampleMethod"
  }
}

// Variable and anonymous constructs code samples
const exampleArrowFunction = () => {
  const exampleBoolean = true;
  if (exampleBoolean) {
  } // scopeId: ".exampleArrowFunction"

  exampleObject['exampleString']; // scopeId: ".exampleArrowFunction"
};

const exampleAnonymousClass = class {
  exampleClassProperty = 'x' + 'y'; // scopeId: ".exampleAnonymousClass"

  constructor() {} // scopeId: ".exampleAnonymousClass.constructor"

  set exampleSetGet(val: string) {
    let preferConst = 0; // scopeId: ".exampleAnonymousClass.exampleSetGet"
    this.exampleClassProperty = val;
  }

  get exampleSetGet() {
    return this.exampleClassProperty;
    exampleString = 'foo'; // scopeId: ".exampleAnonymousClass.exampleSetGet"
  }
};

// Object property and method code samples
const exampleObject2 = {
  exampleObjectProperty: () => {
    {
      // scopeId: ".exampleObject2.exampleObjectProperty"
      return;
    }
  },

  exampleObjectMethod() {
    let exampleUndefined = undefined; // scopeId: ".exampleObject2.exampleObjectMethod"
  }
};

// Absurd examples
class AbsurdClass {
  absurdClassMethod() {
    return class AbsurdClass2 {
      constructor() {
        const absurdObject = {
          absurdObjectMethod() {
            // scopeId: ".AbsurdClass.absurdClassMethod.AbsurdClass2.constructor.absurdObject.absurdObjectMethod"
            const absurdVariable = this ? true : false;
          }
        };
      }
    };
  }
}

const absurdNumber: number = ((absurdParameter: { absurdObjectMethod: () => number }) =>
  absurdParameter.absurdObjectMethod())({
  get absurdObjectMethod(): () => number {
    const absurdArray = [
      function (): number {
        return 7;
      },
      () => {
        // scopeId: "absurdObjectMethod.absurdArray"
        const absurdNumber: number = absurdArray['length'];
        return absurdNumber;
      }
    ];
    return absurdArray[1];
  }
});

// Type, interface, enum code samples
type ExampleObjectType = {
  examplePropertyType: unknown | 'foo'; // scopeId: ".ExampleObjectType"
};

interface ExampleInterface {} // scopeId: ".ExampleInterface"

enum ExampleEnum {
  A = 0,

  B = 1,

  C = 'exampleStringValue'['length'], // scopeId: ".ExampleEnum"

  D = 1 // scopeId: ".ExampleEnum"
}

// Namespace, declare, module code samples
module ExampleModule {
  // scopeId: ".ExampleModule"
  interface ExampleInterface2 {} // scopeId: ".ExampleModule.ExampleInterface2"
}

const x = () => {},
  y = () => {},
  z = () => {};
