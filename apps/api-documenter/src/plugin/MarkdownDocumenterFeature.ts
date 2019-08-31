// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PluginFeature } from './PluginFeature';
import { ApiItem } from '@microsoft/api-extractor-model';

/**
 * Context object for {@link MarkdownDocumenterFeature}.
 *
 * @public
 */
export class MarkdownDocumenterFeatureContext {

}

/**
 * Event arguments for MarkdownDocumenterFeature.onBeforeWritePage()
 * @public
 */
export interface IMarkdownDocumenterFeatureOnBeforeWritePageArgs {
  /**
   * The API item corresponding to this page.
   */
  readonly apiItem: ApiItem;

  /**
   * The page content.  The onBeforeWritePage() handler can reassign this string to customize the page appearance.
   */
  pageContent: string;

  /**
   * The filename where the output will be written.
   */
  readonly outputFilename: string;
}

/**
 * Inherit from this base class to implement an API Documenter plugin feature that customizes
 * the generation of markdown output.
 *
 * @public
 */
export class MarkdownDocumenterFeature extends PluginFeature {
  public context: MarkdownDocumenterFeatureContext;

  /**
   * This event function is called before writing a page.
   * @virtual
   */
  public onBeforeWritePage(eventArgs: IMarkdownDocumenterFeatureOnBeforeWritePageArgs): void {
    // (implemented by child class)
  }
}
