
/**
 * This is an example class.
 *
 * @remarks
 * These are some remarks.
 * @public
 */
export class DocClass1 {

  /**
   * This is an overloaded function.
   * @param x - the number
   * @param a - the first string
   * @param b - the second string
   */
  exampleFunction(a: string, b: string): string;
  exampleFunction(x: number): number;
  public exampleFunction(x: number | string, y?: string): string | number {
    return x;
  }

  /**
   * An example with tables:
   * @remarks
   * <table>
   *  <tr>
   *    <td>John</td>
   *    <td>Doe</td>
   *  </tr>
   * </table>
   */
  tableExample(): void {
  }

  /**
   * Example: "{ \\"maxItemsToShow\\": 123 }"
   *
   * The regular expression used to validate the constraints is /^[a-zA-Z0-9\\-_]+$/
   */
  interestingEdgeCases(): void {
  }
}
