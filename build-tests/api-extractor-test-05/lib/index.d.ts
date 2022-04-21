/** @public */
export namespace testJsLibrary {
  /**
   * This is my constant.
   * @deprecated This is deprecated for a good reason.
   */
  export let MY_CONSTANT : number ;
  /**
   * This is my class.
   */
  export class MyClass {
    private testJsLibrary_MyClass : any;
    /**
     * This method does something.
     * @param x - This is x.
     * @param y - This is y.
     */
    someMethod(x : number , y : string ) : boolean ;
  }
}
