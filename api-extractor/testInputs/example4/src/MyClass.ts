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