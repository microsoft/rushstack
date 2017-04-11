enum inheritEnumValues {
  index_one = 1,
  index_zero = 0
}

// (undocumented)
enum inheritLocalCircularDependencyOne {
}

// (undocumented)
enum inheritLocalCircularDependencyTwo {
}

enum inheritLocalOptionOne {
}

// WARNING: Unable to find referenced member "MyClass.methodWithTwoParams"
export function inheritLocalOptionTwoFunction(): void;

// @internal
enum internalEnum {
}

interface IStructuredTypeInherit {
  thisIsTypeLiteral: [{name: string, age: number}];
}

interface IStructuredTypeSource {
  thisIsTypeLiteral: {
    [ key: string ]: string;
    renderingArea: string;
  }
}

class jsonResolutionClass {
  public jsonResolutionMethod(): boolean;
}

export function jsonResolutionFunction(): boolean;

class MyClass {
}

// @public
enum publicEnum {
}

enum sourceEnumValuesDoc {
  one = 1,
  zero = 0
}

enum testingLinks {
}

// @public
