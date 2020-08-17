// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from './InternalError';

const classUuidSymbol: symbol = Symbol.for('UuidTypeId.classTag');

/**
 * Provides a version-independent implementation of the JavaScript `instanceof` operator.
 *
 * @remarks
 * The JavaScript `instanceof` operator normally only identifies objects from a single library instance.
 * For example, suppose the library `example-lib` exports has two published releases 1.2.0 and 1.3.0, and
 * it exports a `class` called `A`.  Suppose some code consumes version `1.3.0` of the library, but it receives
 * an object that was constructed using version `1.2.0`.  In this situation `a instanceof A` will return `false`,
 * even though `a` is an instance of `A`.  The reason is that there are two prototypes for `A`; one for each
 * version.
 *
 * The `UuidTypeId` facility provides a way to make `x instanceof X` return true for both prototypes of `X`,
 * by instead using a universally unique identifier (UUID) to detect object instances.
 *
 * You can use `Symbol.hasInstance` to enable the real `instanceof` operator to recognize UUID type identities:
 * ```ts
 * const uuidWidget: string = '9c340ef0-d29f-4e2e-a09f-42bacc59024b';
 * class Widget {
 *   public static [Symbol.hasInstance](instance: object): boolean {
 *     return UuidTypeId.isInstanceOf(instance, uuidWidget);
 *   }
 * }
 * ```
 * // Example usage:
 * ```ts
 * import { Widget as Widget1 } from 'v1-of-library';
 * import { Widget as Widget2 } from 'v2-of-library';
 * const widget = new Widget2();
 * console.log(widget instanceof Widget1); // prints true
 * ```
 *
 * @public
 */
export class UuidTypeId {
  private static _uuidRegExp: RegExp = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

  /**
   * Registers a JavaScript class as having a type identified by the specified UUID.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static registerClass(targetClass: new (...args) => any, typeUuid: string): void {
    if (!UuidTypeId._uuidRegExp.test(typeUuid)) {
      throw new Error(`The UUID must be specified as lowercase hexadecimal with dashes: "${typeUuid}"`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetClassPrototype: any = targetClass.prototype;

    if (Object.hasOwnProperty.call(targetClassPrototype, classUuidSymbol)) {
      const existingUuid: string = targetClassPrototype[classUuidSymbol];
      throw new InternalError(
        `Cannot register the target class ${targetClass.name || ''} typeUuid=${typeUuid}` +
          ` because it was already registered with typeUuid=${existingUuid}`
      );
    }
    targetClassPrototype[classUuidSymbol] = typeUuid;
  }

  /**
   * Returns true if the `targetObject` is an instance of a JavaScript class that was previously
   * registered using the specified `typeUuid`.  Base classes are also considered.
   */
  public static isInstanceOf(targetObject: unknown, typeUuid: string): boolean {
    let objectPrototype: {} = Object.getPrototypeOf(targetObject);
    while (objectPrototype !== undefined && objectPrototype !== null) {
      const registeredUuid: string = objectPrototype[classUuidSymbol];
      if (registeredUuid !== undefined) {
        if (registeredUuid === typeUuid) {
          return true;
        }
      }
      // Walk upwards an examine base class prototypes
      objectPrototype = Object.getPrototypeOf(objectPrototype);
    }

    return false;
  }
}
