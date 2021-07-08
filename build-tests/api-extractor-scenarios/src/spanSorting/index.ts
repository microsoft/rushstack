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

/** @public */
export class ExampleC {
  /**
     * This comment is improperly formatted TSDoc.
        * Note that Prettier doesn't try to format it.
     @returns the return value
     @throws an exception
     */
  public member1(): void {}
}

/**
 * Outer description
 * @public
 */
export const exampleD = (o: {
  /**
   * Inner description
   */
  a: number;

  /**
   * @returns a string
   * {@link http://example.com}
   */
  b(): string;
}) => {};
