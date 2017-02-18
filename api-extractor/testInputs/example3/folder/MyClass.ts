/**
 * {@inheritdoc MyClass }
 */
export enum inheritLocalOptionOne {
}

/** 
 * {@inheritdoc MyClass.methodWithTwoParams }
 */
// (Error #1) methodWithTwoParams not a member of MyClass
export function inheritLocalOptionTwoFunction(): void {
}

/**
 * We will try to inherit the documentation for the enum's
 * values.
 */
export enum inheritEnumValues {
  /**
   * {@inheritdoc sourceEnumValuesDoc.zero}
   */
  index_zero = 0,
  /**
   * {@inheritdoc sourceEnumValuesDoc.one}
   */
  index_one = 1,
}

/**
 * We will try to inheritdoc the documentation for 
 * one of the enum value's documentation.
 */
export enum sourceEnumValuesDoc{
  /**
   * This is documentation that we will try to inherit.
   */
  zero = 0,
  /**
   * We will also try to inherit this. 
   */
  one = 1
}

/**
 * {@inheritdoc inheritLocalCircularDependencyTwo }
 */
// (Error #2) Circular reference
export enum inheritLocalCircularDependencyOne {
}

/**
 * {@inheritdoc inheritLocalCircularDependencyOne }
 */
export enum inheritLocalCircularDependencyTwo {
}

/**
 * {@inheritdoc es6-collections:ForEachable }
 */
export interface IJsonResolutionInterface {
}


/**
 * {@inheritdoc es6-collections:aFunction }
 */
export function jsonResolutionFunction(): boolean {
  return true;
}

/**
 * {@inheritdoc es6-collections:aClass }
 */
export class jsonResolutionClass {
  /**
   * {@inheritdoc es6-collections:ForEachable.aMethod }
   */
  public jsonResolutionMethod(): boolean {
      return true;
  }
}


/**
 * This is the summary for MyClass.
 */
export default class MyClass {

}

/**
 * {@inheritdoc IStructuredTypeSource}
 */

export interface IStructuredTypeInherit {
  /**
   * {@inheritdoc IStructuredTypeSource.thisIsTypeLiteral}
   */
  thisIsTypeLiteral: [{name: string, age: number}];
}

/**
 * This is a summary on the interface API item.
 */

export interface IStructuredTypeSource {
  /**
   * This is the summary on an API item that is a type literal.
   */
  thisIsTypeLiteral: {
    [ key: string ]: string;
    renderingArea: string;
  }
}

/**
 * Here we test that an error is reported when attempting to link to an 
 * internal API item.
 * {@link publicEnum}
 * {@link internalEnum}
 */
export enum testingLinks {
}

/**
 * This enum is public and any API items can safely inherit documentation
 * or link to this item.
 * 
 * @public
 */
export enum publicEnum {
}

/**
 * This enum is internal and an error should be reported 
 * if any API items inherit or link to this item.
 * 
 * @internal
 */
export enum internalEnum {
}