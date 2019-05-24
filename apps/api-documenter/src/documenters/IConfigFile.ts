// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IYamlTocFile } from '../yaml/IYamlTocFile';

/**
 * Typescript interface describing the config schema for toc.yml file format.
 */
export interface IConfigTableOfContents {
  /**
   * Represents the tree structure describing the toc.file format.
   * Nodes that have an empty `items` array property or their name will be included in the
   * {@link IConfigTableOfContents.categoryNodes} will be filled with API items
   * that are matched with the filters provided. Everything else will be placed under a catchAll category
   * that is highly recommended to be provided.
   */
  tocConfig: IYamlTocFile;

  /**
   * Optional category name that is recommended to be included along with
   * one of the filters available: `filterByApiItemName` or `filterByInlineTag`.
   * Any items that are not matched to the mentioned filters will be placed under this
   * catchAll category. If none provided the items will not be included in the final toc.yml file.
   */
  catchAllCategory?: string;

  /**
   * Toggle either sorting of the API items should be made based on category name presence
   * in the API item's name. Useful when there are API items without an inline tag to categorize them,
   * but still need to filter the items under categories. Note: this type of filter might place some items
   * under wrong categories if the names similar but are supposed to be in different categories.
   */
  categorizeByName?: boolean;

  /**
   * Filter that can be used to sort the API items according to an inline custom tag
   * that is present on them.
   */
  categoryInlineTag?: string;

  /**
   * Array of node names to which API items will be pushed when filtered
   */
  nonEmptyCategoryNodeNames?: string[];
}

/**
 * This interface represents the api-extractor.json file format.
 */
export interface IConfigFile {
  /** {@inheritDoc IConfigTableOfContents} */
  tableOfContents?: IConfigTableOfContents;
}
