// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This class has links such as {@link TypeReferencesInAedoc}.
 * @public
 */
export class TypeReferencesInAedoc {
  /**
   * Returns a value
   * @param arg1 - The input parameter of type {@link TypeReferencesInAedoc}.
   * @returns An object of type {@link TypeReferencesInAedoc}.
   */
  public getValue(arg1: TypeReferencesInAedoc): TypeReferencesInAedoc {
    return this;
  }

  /** {@inheritDoc api-extractor-test-01#TypeReferencesInAedoc.getValue} */
  public getValue2(arg1: TypeReferencesInAedoc): TypeReferencesInAedoc {
    return this;
  }

  /**
   * @param arg - Malformed param reference.
   */
  public getValue3(arg1: TypeReferencesInAedoc): TypeReferencesInAedoc {
    return this;
  }
}
