// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IApiDocumenterPluginManifest } from '@microsoft/api-documenter';
import { RushStackExtension } from './RushStackExtension';

// tslint:disable-next-line:export-name
export const apiDocumenterPluginManifest: IApiDocumenterPluginManifest = {
  extensions: [
    {
      name: 'rush-stack',
      kind: 'MarkdownDocumenterExtension',
      subclass: RushStackExtension
    }
  ]
};
