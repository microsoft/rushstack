// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ReleaseTag } from '@microsoft/api-extractor-model';

export class SymbolMetadata {
  public releaseTag: ReleaseTag = ReleaseTag.None;

  // If true, then it would be redundant to show this release tag
  public releaseTagSameAsParent: boolean = false;
}
