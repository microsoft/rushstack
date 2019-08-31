// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { MarkdownDocumenterFeature, IMarkdownDocumenterFeatureOnBeforeWritePageArgs } from '@microsoft/api-documenter';

export class RushStackFeature extends MarkdownDocumenterFeature {
  public onInitialized(): void {
    console.log('RushStackFeature: onInitialized()');
  }

  public onBeforeWritePage(eventArgs: IMarkdownDocumenterFeatureOnBeforeWritePageArgs): void {
    const header: string = [
      '---',
      'layout: page',
      'navigation_source: api_nav',
      'improve_this_button: false',
      '---',
      ''
    ].join('\n');
    eventArgs.pageContent = header + eventArgs.pageContent;
  }
}
