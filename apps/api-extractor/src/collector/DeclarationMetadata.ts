// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as tsdoc from '@microsoft/tsdoc';
import { ReleaseTag } from '../aedoc/ReleaseTag';

export class DeclarationMetadata {
  public tsdocComment: tsdoc.DocComment | undefined = undefined;

  /**
   * This is the release tag that was explicitly specified in the original doc comment, if any.
   * Compare with SymbolMetadata.releaseTag, which is the effective release tag, possibly inherited from
   * a parent.
   */
  public declaredReleaseTag: ReleaseTag = ReleaseTag.None;
}
