// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { MarkdownDocumenterExtension } from './MarkdownDocumenterExtension';

export interface IExtensionDefinition {
  /**
   * The name of this extension, as it will appear in the config file.
   *
   * The name should consist of one or more words separated by hyphens.  Each word should consist of lower case
   * letters and numbers.  Example: `my-extension`
   */
  name: string;

  /**
   * The name of the base class.
   */
  kind: 'MarkdownDocumenterExtension';

  /**
   * Your subclass that extends from the base class.
   */
  subclass: { new(): MarkdownDocumenterExtension };
}

export interface IApiDocumenterPluginManifest {
  extensions: IExtensionDefinition[];
}
