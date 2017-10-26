// @internal
enum _internalEnum {
}

// @public
enum inheritEnumValues {
  index_one = 1,
  index_zero = 0
}

// @public (undocumented)
enum inheritLocalCircularDependencyOne {
}

// @public (undocumented)
enum inheritLocalCircularDependencyTwo {
}

// @public
enum inheritLocalOptionOne {
}

// WARNING: Unable to find referenced member "MyClass.methodWithTwoParams"
// @public
export function inheritLocalOptionTwoFunction(): void;

// @public
interface IStructuredTypeInherit {
  thisIsTypeLiteral: [{name: string, age: number}];
}

// @public
interface IStructuredTypeSource {
  thisIsTypeLiteral: {
    [ key: string ]: string;
    renderingArea: string;
  }
}

// @public
class jsonResolutionClass {
  public jsonResolutionMethod(): boolean;
}

// @public
export function jsonResolutionFunction(): boolean;

// @public
class MyClass {
}

// @public
enum publicEnum {
}

// @public
enum sourceEnumValuesDoc {
  one = 1,
  zero = 0
}

// @public
enum testingLinks {
}

