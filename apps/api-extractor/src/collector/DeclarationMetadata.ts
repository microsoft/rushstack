// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as tsdoc from '@microsoft/tsdoc';
import { ReleaseTag } from '@microsoft/api-extractor-model';
import { VisitorState } from './VisitorState';

export class DeclarationMetadata {
  /**
   * This is the original TSDoc comment parsed from the source code.
   * It may be modified (or constructed artificially) by the DocCommentEnhancer.
   */
  public tsdocComment: tsdoc.DocComment | undefined = undefined;

  /**
   * The ParserContext from when the TSDoc comment was parsed from the source code.
   * If the source code did not contain a doc comment, then this will be undefined.
   */
  public tsdocParserContext: tsdoc.ParserContext | undefined = undefined;

  /**
   * This is the release tag that was explicitly specified in the original doc comment, if any.
   */
  public declaredReleaseTag: ReleaseTag = ReleaseTag.None;

  /**
   * The "effective" release tag is a normalized value that is based on `declaredReleaseTag`,
   * but may be inherited from a parent, or corrected if the declared value was somehow invalid.
   * When actually trimming .d.ts files or generating docs, API Extractor uses the "effective" value
   * instead of the "declared" value.
   */
  public effectiveReleaseTag: ReleaseTag = ReleaseTag.None;

  // NOTE: In the future, the Collector may infer or error-correct some of these states.
  // Generators should rely on these instead of tsdocComment.modifierTagSet.
  public isEventProperty: boolean = false;
  public isOverride: boolean = false;
  public isSealed: boolean = false;
  public isVirtual: boolean = false;

  public isPreapproved: boolean = false;

  // Assigned by DocCommentEnhancer
  public needsDocumentation: boolean = true;

  public docCommentEnhancerVisitorState: VisitorState = VisitorState.Unvisited;
}
