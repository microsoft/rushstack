
/**
  * @badjsdoctag This is some jsdoc
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
