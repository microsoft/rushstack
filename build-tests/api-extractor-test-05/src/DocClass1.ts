
/**
 * A class used to exposed events.
 * @public
 */
export class SystemEvent {
  /**
   * Adds an handler for the event.
   */
  public addHandler(handler: ()=>void): void {
  }
}

/**
 * This is an example class.
 *
 * @remarks
 * These are some remarks.
 * @defaultvalue a default value for this function
 * @public
 */
export class DocClass1 {

  /**
   * This is an overloaded function.
   * @param a - the first string
   * @param b - the second string
   */
  exampleFunction(a: string, b: string): string;

  /**
   * This is also an overloaded function.
   * @param x - the number
   */
  exampleFunction(x: number): number;

  public exampleFunction(x: number | string, y?: string): string | number {
    return x;
  }

  /**
   * This event is fired whenever the object is modified.
   * @eventproperty
   */
  public readonly modifiedEvent: SystemEvent;

  /**
   * This event should have been marked as readonly.
   * @eventproperty
   */
  public malformedEvent: SystemEvent;

  /**
   * This is a regular property that happens to use the SystemEvent type.
   */
  public regularProperty: SystemEvent;

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
   * Example: "\{ \\"maxItemsToShow\\": 123 \}"
   *
   * The regular expression used to validate the constraints is /^[a-zA-Z0-9\\-_]+$/
   */
  interestingEdgeCases(): void {
  }

  /**
   * @deprecated Use `otherThing()` instead.
   */
  public deprecatedExample(): void {
  }

  /**
   * Returns the sum of two numbers.
   *
   * @remarks
   * This illustrates usage of the `@example` block tag.
   *
   * @param x - the first number to add
   * @param y - the second number to add
   * @returns the sum of the two numbers
   *
   * @example
   * Here's a simple example:
   * ```
   * // Prints "2":
   * console.log(DocClass1.sumWithExample(1,1));
   * ```
   * @example
   * Here's an example with negative numbers:
   * ```
   * // Prints "0":
   * console.log(DocClass1.sumWithExample(1,-1));
   * ```
   */
  public static sumWithExample(x: number, y: number): number {
    return x + y;
  }
}
