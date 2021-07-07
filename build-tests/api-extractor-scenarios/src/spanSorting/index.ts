/**
 * Doc comment
 * @public
 */
export class ExampleA {
  private _member3: string = '';
  public member2(): Promise<void> {
    return Promise.resolve();
  }
  public member1: string = '';
}

/**
 * Doc comment
 * @public
 */
export class ExampleB {
  /**
   * If the file exists, calls loadFromFile().
   */
  public tryLoadFromFile(approvedPackagesPolicyEnabled: boolean): boolean {
    return false;
  }

  /**
   * Helper function that adds an already created ApprovedPackagesItem to the
   * list and set.
   */
  private _addItem(): void {}
}
