// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as tsdoc from '@microsoft/tsdoc';
import { ReleaseTag } from '@microsoft/api-extractor-model';
import { VisitorState } from './VisitorState';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { InternalError } from '@microsoft/node-core-library';

/**
 * Constructor parameters for `DeclarationMetadata`.
 */
export interface IDeclarationMetadataOptions {
  tsdocParserContext: tsdoc.ParserContext | undefined;
  declaredReleaseTag: ReleaseTag;
  effectiveReleaseTag: ReleaseTag;
  releaseTagSameAsParent: boolean;
  isEventProperty: boolean;
  isOverride: boolean;
  isSealed: boolean;
  isVirtual: boolean;
  isPreapproved: boolean;
}

/**
 * Stores the Collector's additional analysis for an `AstDeclaration`.  This object is assigned to
 * `AstDeclaration.metadata` but consumers must always obtain it by calling `Collector.fetchMetadata().
 */
export class DeclarationMetadata {
  /**
   * The ParserContext from when the TSDoc comment was parsed from the source code.
   * If the source code did not contain a doc comment, then this will be undefined.
   */
  public readonly tsdocParserContext: tsdoc.ParserContext | undefined;

  /**
   * This is the release tag that was explicitly specified in the original doc comment, if any.
   */
  public readonly declaredReleaseTag: ReleaseTag;

  /**
   * The "effective" release tag is a normalized value that is based on `declaredReleaseTag`,
   * but may be inherited from a parent, or corrected if the declared value was somehow invalid.
   * When actually trimming .d.ts files or generating docs, API Extractor uses the "effective" value
   * instead of the "declared" value.
   */
  public readonly effectiveReleaseTag: ReleaseTag;

  // If true, then it would be redundant to show this release tag
  public readonly releaseTagSameAsParent: boolean;

  // NOTE: In the future, the Collector may infer or error-correct some of these states.
  // Generators should rely on these instead of tsdocComment.modifierTagSet.
  public readonly isEventProperty: boolean;
  public readonly isOverride: boolean;
  public readonly isSealed: boolean;
  public readonly isVirtual: boolean;

  public readonly isPreapproved: boolean;

  /**
   * This is the original TSDoc comment parsed from the source code.
   * It may be modified (or constructed artificially) by the DocCommentEnhancer.
   */
  public tsdocComment: tsdoc.DocComment | undefined;

  // Assigned by DocCommentEnhancer
  public needsDocumentation: boolean = true;

  public docCommentEnhancerVisitorState: VisitorState = VisitorState.Unvisited;

  /**
   * If true, then this declaration is treated as part of another declaration.
   */
  public isAncillary: boolean = false;

  /**
   * A list of other declarations that are treated as being part of this declaration.  For example, a property
   * getter/setter pair will be treated as a single API item, with the setter being treated as ancillary to the getter.
   *
   * If the `ancillaryDeclarations` array is non-empty, then `isAncillary` will be false for this declaration,
   * and `isAncillary` will be true for all the array items.
   */
  public ancillaryDeclarations: AstDeclaration[] = [];

  public constructor(options: IDeclarationMetadataOptions) {
    this.tsdocParserContext = options.tsdocParserContext;
    this.declaredReleaseTag = options.declaredReleaseTag;
    this.effectiveReleaseTag = options.effectiveReleaseTag;
    this.releaseTagSameAsParent = options.releaseTagSameAsParent;
    this.isEventProperty = options.isEventProperty;
    this.isOverride = options.isOverride;
    this.isSealed = options.isSealed;
    this.isVirtual = options.isVirtual;
    this.isPreapproved = options.isPreapproved;
  }

  public addAncillaryDeclaration(otherDeclaration: AstDeclaration): void {
    const otherMetadata: DeclarationMetadata = otherDeclaration.metadata as DeclarationMetadata;

    if (!otherMetadata) {
      throw new InternalError('addAncillaryDeclaration() cannot be called before the declaration metadata is solved');
    }

    if (this.ancillaryDeclarations.indexOf(otherDeclaration) >= 0) {
      return;  // already added
    }

    if (this.isAncillary) {
      throw new InternalError('Invalid call to addAncillaryDeclaration() because the target is ancillary itself');
    }

    if (otherMetadata.isAncillary) {
      throw new InternalError('Invalid call to addAncillaryDeclaration() because source is already ancillary to another declaration');
    }

    otherMetadata.isAncillary = true;
    this.ancillaryDeclarations.push(otherDeclaration);
  }
}
