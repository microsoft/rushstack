// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { MarkdownDocumenterFeature } from '@microsoft/api-documenter';

export class RushStackFeature extends MarkdownDocumenterFeature {
  public onInitialized(): void {
    console.log('RushStackFeature: onInitialized()');
  }
}
