import { MyLibrary2 as MyLibrary3 } from '@ms/library';
import MissingExport from './MissingExport';
import { RenamedExport as RenamedExport2 } from './RenamedExport';
import MyOtherClass from './MyOtherClass';

/**
 * Here is some sample documentation for this class.
 * @public
 */
export default class MyClass {
  /**
   * This is a property that is used to test the 
   * collection of type references on getters and 
   * setters. The API file should show an unresolved
   * type warning.
   */
  private _propOne: MissingExport;

  /**
   * Here we are testing if type collection is being 
   * executed for type literals. The API file should show 
   * an unresolved type warning.
   */
  public typeLiteralProp: [MissingExport];
  
  /**
   * This is a getter to test if the type reference is
   * collected. The API file should show an unresolved
   * type warning.
   */
  public get propOne(): MissingExport {
    return this._propOne;
  }

  /**
   * This is a setter to test if the type reference is
   * collected. The API file should show an unresolved
   * type warning.
   */
  public set propOne(value: MissingExport) {
    this._propOne = value;
  }

  /**
   * This function should show a warning in the API file 
   * as a result of the parameter type.
   */
  public testParameterType(missing: MissingExport): void {
    return;
  }

  /**
   * Here is some sample documentation for test().
   */
  public test(library: MyLibrary3): MissingExport {
    return undefined;
  }

  public renamed(): RenamedExport2 {
    return undefined;
  }

  public otherTest(): MyOtherClass {
    return undefined;
  }
}

/*

{
  "signature": "public test(): MyLibrary2;"
  "references": {
    "MyLibrary2": {
      "refType": "packageExport",
      "package": "@ms/library",
      "name": "MyLibrary2"
    },
    "MissingExport": {
      "refType": "packageExport",
      "package": "@ms/example2",
      "name": "<missing>"
    },
  }
}

*/