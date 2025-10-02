// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as tsdoc from '@microsoft/tsdoc';

import type { AstDeclaration } from '../analyzer/AstDeclaration';

/**
 * Stores the Collector's additional analysis for a specific `AstDeclaration` signature.  This object is assigned to
 * `AstDeclaration.declarationMetadata` but consumers must always obtain it by calling
 * `Collector.fetchDeclarationMetadata()`.
 *
 * Note that ancillary declarations share their `ApiItemMetadata` with the main declaration,
 * whereas a separate `DeclarationMetadata` object is created for each declaration.
 */
export abstract class DeclarationMetadata {
  /**
   * The ParserContext from when the TSDoc comment was parsed from the source code.
   * If the source code did not contain a doc comment, then this will be undefined.
   *
   * Note that if an ancillary declaration has a doc comment, it is tracked here, whereas
   * `ApiItemMetadata.tsdocComment` corresponds to documentation for the main declaration.
   */
  public abstract readonly tsdocParserContext: tsdoc.ParserContext | undefined;

  /**
   * If true, then this declaration is treated as part of another declaration.
   */
  public abstract readonly isAncillary: boolean;

  /**
   * A list of other declarations that are treated as being part of this declaration.  For example, a property
   * getter/setter pair will be treated as a single API item, with the setter being treated as ancillary to the getter.
   *
   * If the `ancillaryDeclarations` array is non-empty, then `isAncillary` will be false for this declaration,
   * and `isAncillary` will be true for all the array items.
   */
  public abstract readonly ancillaryDeclarations: ReadonlyArray<AstDeclaration>;
}

/**
 * Used internally by the `Collector` to build up `DeclarationMetadata`.
 */
export class InternalDeclarationMetadata extends DeclarationMetadata {
  public tsdocParserContext: tsdoc.ParserContext | undefined = undefined;

  public isAncillary: boolean = false;

  public ancillaryDeclarations: AstDeclaration[] = [];
}
