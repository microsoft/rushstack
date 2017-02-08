
/**
  * @badjsdoctag (Error #1 is the bad tag) Text can not come after a tag unless it is a parameter of
  * the tag. It must come in the first few sentences of the JSDoc or come after 
  * an \@internalremarks tag. (Error #2 text coming after a tag that is not \@internalremarks)
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
   * (Error) occurs here because there is no type declared.
   */
  public static propertyWithNoType;

  /**
   * Comment 1
   */
  public test(): void {
    console.log('this is a public API');
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
 */
export class __proto__ {
    public propertyIsEnumerable: string;
}

export interface hasOwnProperty {
    __lookupSetter__: __proto__;
}

export class A extends __proto__ implements hasOwnProperty {
    __lookupSetter__: __proto__;
    public __proto__(__proto__: string): __proto__ {
        return undefined;   
    }
}