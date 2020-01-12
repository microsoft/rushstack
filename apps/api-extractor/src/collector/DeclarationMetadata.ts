// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as tsdoc from '@microsoft/tsdoc';
import { ReleaseTag } from '@microsoft/api-extractor-model';
import { VisitorState } from './VisitorState';

/**
 * Constructor parameters for `DeclarationMetadata`.
 */
export interface IDeclarationMetadataOptions {
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
 * `AstDeclaration.declarationMetadata` but consumers must always obtain it by calling `Collector.fetchMetadata().
 *
 * Note that ancillary declarations share their `DeclarationMetadata` with the main declaration,
 * whereas a separate `SignatureMetadata` object is created for each `AstDeclaration`.
 */
export class DeclarationMetadata {
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
   * This is the TSDoc comment for the declaration.  It may be modified (or constructed artificially) by
   * the DocCommentEnhancer.
   */
  public tsdocComment: tsdoc.DocComment | undefined;

  // Assigned by DocCommentEnhancer
  public needsDocumentation: boolean = true;

  public docCommentEnhancerVisitorState: VisitorState = VisitorState.Unvisited;

  public constructor(options: IDeclarationMetadataOptions) {
    this.declaredReleaseTag = options.declaredReleaseTag;
    this.effectiveReleaseTag = options.effectiveReleaseTag;
    this.releaseTagSameAsParent = options.releaseTagSameAsParent;
    this.isEventProperty = options.isEventProperty;
    this.isOverride = options.isOverride;
    this.isSealed = options.isSealed;
    this.isVirtual = options.isVirtual;
    this.isPreapproved = options.isPreapproved;
  }
}
