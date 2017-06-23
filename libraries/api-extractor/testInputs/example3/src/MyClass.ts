// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * {@inheritdoc MyClass }
 * @public
 */
export enum inheritLocalOptionOne {
}

/**
 * {@inheritdoc MyClass.methodWithTwoParams }
 * @public
 */
// (Error #1) methodWithTwoParams not a member of MyClass
export function inheritLocalOptionTwoFunction(): void {
}

/**
 * We will try to inherit the documentation for the enum's
 * values.
 * @public
 */
export enum inheritEnumValues {
  /**
   * {@inheritdoc sourceEnumValuesDoc.zero}
   */
  index_zero = 0,
  /**
   * {@inheritdoc @scope/example3:sourceEnumValuesDoc.one}
   */
  index_one = 1,
}

/**
 * We will try to inheritdoc the documentation for
 * one of the enum value's documentation.
 * @public
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
 * @public
 */
// (Error #2) Circular reference
export enum inheritLocalCircularDependencyOne {
}

/**
 * {@inheritdoc inheritLocalCircularDependencyOne }
 * @public
 */
export enum inheritLocalCircularDependencyTwo {
}

/**
 * {@inheritdoc es6-collections:ForEachable }
 * @public
 */
export interface IJsonResolutionInterface {
}


/**
 * {@inheritdoc es6-collections:aFunction }
 * @public
 */
export function jsonResolutionFunction(): boolean {
  return true;
}

/**
 * {@inheritdoc es6-collections:aClass }
 * @public
 */
export class jsonResolutionClass {
  /**
   * {@inheritdoc es6-collections:aFunction }
   */
  public jsonResolutionMethod(): boolean {
      return true;
  }
}


/**
 * This is the summary for MyClass.
 * @public
 */
export default class MyClass {

}

/**
 * {@inheritdoc IStructuredTypeSource}
 * @public
 */
export interface IStructuredTypeInherit {
  /**
   * {@inheritdoc IStructuredTypeSource.thisIsTypeLiteral}
   */
  thisIsTypeLiteral: [{name: string, age: number}];
}

/**
 * This is a summary on the interface API item.
 * @public
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
 * {@link _internalEnum}
 * @public
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
