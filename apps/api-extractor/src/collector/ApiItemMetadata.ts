// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as tsdoc from '@microsoft/tsdoc';
import type { ReleaseTag } from '@microsoft/api-extractor-model';

import { VisitorState } from './VisitorState';

/**
 * Constructor parameters for `ApiItemMetadata`.
 */
export interface IApiItemMetadataOptions {
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
 * `AstDeclaration.apiItemMetadata` but consumers must always obtain it by calling `Collector.fetchApiItemMetadata()`.
 *
 * @remarks
 * Note that ancillary declarations share their `ApiItemMetadata` with the main declaration,
 * whereas a separate `DeclarationMetadata` object is created for each declaration.
 *
 * Consider this example:
 * ```ts
 * export declare class A {
 *   get b(): string;
 *   set b(value: string);
 * }
 * export declare namespace A { }
 * ```
 *
 * In this example, there are two "symbols": `A` and `b`
 *
 * There are four "declarations": `A` class, `A` namespace, `b` getter, `b` setter
 *
 * There are three "API items": `A` class, `A` namespace, `b` property.  The property getter is the main declaration
 * for `b`, and the setter is the "ancillary" declaration.
 */
export class ApiItemMetadata {
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

  /**
   * Tracks whether or not the associated API item is known to be missing sufficient documentation.
   *
   * @remarks
   *
   * An "undocumented" item is one whose TSDoc comment which either does not contain a summary comment block, or
   * has an `@inheritDoc` tag that resolves to another "undocumented" API member.
   *
   * If there is any ambiguity (e.g. if an `@inheritDoc` comment points to an external API member, whose documentation,
   * we can't parse), "undocumented" will be `false`.
   *
   * @remarks Assigned by {@link DocCommentEnhancer}.
   */
  public undocumented: boolean = true;

  public docCommentEnhancerVisitorState: VisitorState = VisitorState.Unvisited;

  public constructor(options: IApiItemMetadataOptions) {
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
