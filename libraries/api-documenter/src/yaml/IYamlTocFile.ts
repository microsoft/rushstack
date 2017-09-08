// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A node in the navigation hierarchy for the table of contents.
 */
export interface IYamlTocItem {
  name: string;
  href: string;
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
