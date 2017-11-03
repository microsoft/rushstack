// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
  * @badAedocTag (Error #1 is the bad tag) Text can not come after a tag unless it is a parameter of
  * the tag. It must come in the first few sentences of the AEDoc or come after
  * an \@internalremarks tag. (Error #2 text coming after a tag that is not \@internalremarks)
  * @public
  */
export default class MyClass {
  public test(): void {
    console.log('this is a public API');
  }
  private _privateTest(): void {
    console.log('this is a private API');
  }
  public field: number;

  public get myProp(): number {
    return 123;
  }
  public set myProp(value: number) {
    console.log(value);
  }

  /**
   *    This is   the
   * first paragraph.
   *
   * This is the {@link MyClass} paragraph.
   *
   *
   *
   * This is the third paragraph
   *
   *
   */
  public paragraphTest(): void {
    return;
  }
}

class PrivateClass {
  public test(): void {
  }
}

/**
 * This is a class that should not appear in the output.
 * @internal
 */
export class InternalClass {
  /**
   * This will not report an error, instead a 'WARNING' comment will
   * appear above this class declaration in the API file as a result of
   * no type declaration.
   */
  public static propertyWithNoType;

  /**
   * Comment 1
   */
  public test(): void {
    console.log('this is a public API');
  }

  /**
   * This *implicitly* internal method should NOT have an underscore.
   * API Extractor currently does NOT issue a warning for this case.
   */
  public _internalMethodWithRedundantUnderscore(): void {
  }
}

/**
 * This is some text that should not appear in the output.
 * @preapproved
 * @internal
 */
export class PreapprovedInternalClass {
  /**
   * Comment 1
   */
  public test(): void {
    console.log('this is a public API');
  }

  private _privateTest(): void {
    console.log('this is a private API');
  }

  /**
   * Comment 2
   */
  public field: number;
}

const privateField = 123;

/**
 * This is testing identifiers whose name is the same as the
 * members of the object prototype.
 * @public
 */
export class __proto__ {
    public propertyIsEnumerable: string;
}

/** @public */
export interface hasOwnProperty {
    __lookupSetter__: __proto__;
}

/** @public */
export class A extends __proto__ implements hasOwnProperty {
  __lookupSetter__: __proto__;
  public __proto__(__proto__: string): __proto__ {
    return undefined;
  }
}
