// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ReleaseTag } from '@microsoft/api-extractor-model';

export class SymbolMetadata {
  // For all declarations associated with this symbol, this is the
  // `DeclarationMetadata.effectiveReleaseTag` value that is most public.
  public maxEffectiveReleaseTag: ReleaseTag = ReleaseTag.None;
}
