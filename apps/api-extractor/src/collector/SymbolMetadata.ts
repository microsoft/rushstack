// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ReleaseTag } from '@microsoft/api-extractor-model';

export class SymbolMetadata {
  public maxEffectiveReleaseTag: ReleaseTag = ReleaseTag.None;
}
