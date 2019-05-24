// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IYamlTocFile } from '../yaml/IYamlTocFile';

/**
 * Typescript interface describing the config schema for toc.yml file format.
 */
export interface IConfigTableOfContents {
  /**
   * Represents the tree structure describing the toc.file format.
   * Only the nodes that have an empty `items` array will be filled with API items
   * that are matched with the filters provided. Everything else will be placed under a catchAll category
   * that is highly recommended to be provided.
   */
  tocConfig: IYamlTocFile;

  /**
   * Optional category name that is recommended to include in the `tocConfig`,
   * along with one of the filters: `filterByApiItemName` or `filterByInlineTag`.
   * Any items that are not matched to the mentioned filters will be placed under this
   * catchAll category. If none provided the items will not be included in the final toc.yml file.
   */
  catchAllCategory?: string;

  /**
   * Toggle either sorting of the API items should be made based on category name presence
   * in the API item's name.
   */
  filterByApiItemName?: boolean;

  /**
   * Filter that can be used to sort the API items according to an inline custom tag
   * that is present on them.
   */
  filterByInlineTag?: string;

  /**
   * Array of node names to which API items will be pushed when filtered
   */
  categoryNodes?: string[];
}

/**
 * This interface represents the api-extractor.json file format.
 */
export interface IConfigFile {
  /** {@inheritDoc IConfigTableOfContents} */
  tableOfContents?: IConfigTableOfContents;
}
