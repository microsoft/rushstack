// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Example of an abstract class that is exported separately from its
 * definition.
 *
 * @public
 */
abstract class AbstractClass2 {
  public abstract test2(): void;
}

export default AbstractClass2;

/**
 * Example of an abstract class that is not the default export
 *
 * @public
 */
export abstract class AbstractClass3 {
  public abstract test3(): void;
}
