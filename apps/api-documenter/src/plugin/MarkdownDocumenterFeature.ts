// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiModel } from '@microsoft/api-extractor-model';
import { TypeUuid } from '@rushstack/node-core-library';
import { PluginFeature } from './PluginFeature';
import { MarkdownDocumenterAccessor } from './MarkdownDocumenterAccessor';

/**
 * Context object for {@link MarkdownDocumenterFeature}.
 * Exposes various services that can be used by a plugin.
 *
 * @public
 */
export class MarkdownDocumenterFeatureContext {
  /**
   * Provides access to the `ApiModel` for the documentation being generated.
   */
  public readonly apiModel: ApiModel;

  /**
   * The full path to the output folder.
   */
  public readonly outputFolder: string;

  /**
   * Exposes functionality of the documenter.
   */
  public readonly documenter: MarkdownDocumenterAccessor;

  /** @internal */
  public constructor(options: MarkdownDocumenterFeatureContext) {
    this.apiModel = options.apiModel;
    this.outputFolder = options.outputFolder;
    this.documenter = options.documenter;
  }
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
   * The page content.  The {@link MarkdownDocumenterFeature.onBeforeWritePage} handler can reassign this
   * string to customize the page appearance.
   */
  pageContent: string;

  /**
   * The filename where the output will be written.
   */
  readonly outputFilename: string;
}

/**
 * Event arguments for MarkdownDocumenterFeature.onFinished()
 * @public
 */
export interface IMarkdownDocumenterFeatureOnFinishedArgs {}

const uuidMarkdownDocumenterFeature: string = '34196154-9eb3-4de0-a8c8-7e9539dfe216';

/**
 * Inherit from this base class to implement an API Documenter plugin feature that customizes
 * the generation of markdown output.
 *
 * @public
 */
export class MarkdownDocumenterFeature extends PluginFeature {
  /** {@inheritdoc PluginFeature.context} */
  public context!: MarkdownDocumenterFeatureContext;

  /**
   * This event occurs before each markdown file is written.  It provides an opportunity to customize the
   * content of the file.
   * @virtual
   */
  public onBeforeWritePage(eventArgs: IMarkdownDocumenterFeatureOnBeforeWritePageArgs): void {
    // (implemented by child class)
  }

  /**
   * This event occurs after all output files have been written.
   * @virtual
   */
  public onFinished(eventArgs: IMarkdownDocumenterFeatureOnFinishedArgs): void {
    // (implemented by child class)
  }

  public static [Symbol.hasInstance](instance: object): boolean {
    return TypeUuid.isInstanceOf(instance, uuidMarkdownDocumenterFeature);
  }
}

TypeUuid.registerClass(MarkdownDocumenterFeature, uuidMarkdownDocumenterFeature);
