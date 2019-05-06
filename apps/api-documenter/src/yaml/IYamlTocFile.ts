// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A node in the navigation hierarchy for the table of contents.
 */
export interface IYamlTocItem {
  /**
   * The title to display
   */
  name: string;

  /**
   * If specified, the hyperlink will point to the API with this UID
   */
  uid?: string;

  /**
   * IF specified, the hyperlink will point to this URL, which may be a relative URL path
   */
  href?: string;

  /**
   * Child nodes in the hierarchy
   */
  items?: IYamlTocItem[];
}

/**
 * TypeScript interface describing the toc.yml file format, used to represent
 * the table of contents for a Universal Reference YAML documentation file.
 */
export interface IYamlTocFile {
  items: IYamlTocItem[];
  metadata?: { [key: string]: string };
}

/**
 * Typescript interface describing the config schema for toc.yml file format.
 */
export interface IYamlTocConfigSchema {
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
   * When loading more than one api.json files that might include the same API items,
   * toggle either to show duplicates or not.
   */
  noDuplicateEntries?: boolean;

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
}
