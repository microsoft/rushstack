// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @public
 */
export class DefaultExportEdgeCase {
  /**
   * This reference is encountered before the definition of DefaultExportEdgeCase.
   * The symbol.name will be "default" in this situation.
   */
  public reference: ClassExportedAsDefault;
}

/**
 * Referenced by DefaultExportEdgeCaseReferencer.
 * @public
 */
export default class ClassExportedAsDefault {}
