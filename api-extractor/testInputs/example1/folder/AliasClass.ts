
/**
 * JSDOc for AliasClass
 * @public
 */
export class AliasClass {
  private readOnlyNumber: number;

  /**
   * JSDOc for aliasFunc()
   * @internal
   */
  public aliasFunc(): void {
    console.log('this is a public API');
  }
  public aliasField: number;



  public get shouldBeReadOnly(): number {
    return this.readOnlyNumber;
  }
}

class PrivateAliasClass {
  public test(): void {
  }
}
