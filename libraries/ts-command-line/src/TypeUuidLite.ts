// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const classPrototypeUuidSymbol: symbol = Symbol.for('TypeUuid.classPrototypeUuid');

export const uuidAlreadyReportedError: string = 'f26b0640-a49b-49d1-9ead-1a516d5920c7';

// Avoid a dependency on node-core-library to access just this one API:
export class TypeUuid {
  /**
   * Returns true if the `targetObject` is an instance of a JavaScript class that was previously
   * registered using the specified `typeUuid`.  Base classes are also considered.
   */
  public static isInstanceOf(targetObject: unknown, typeUuid: string): boolean {
    if (targetObject === undefined || targetObject === null) {
      return false;
    }

    let objectPrototype: {} = Object.getPrototypeOf(targetObject);
    while (objectPrototype !== undefined && objectPrototype !== null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registeredUuid: string = (objectPrototype as any)[classPrototypeUuidSymbol];
      if (registeredUuid === typeUuid) {
        return true;
      }
      // Walk upwards an examine base class prototypes
      objectPrototype = Object.getPrototypeOf(objectPrototype);
    }

    return false;
  }
}
