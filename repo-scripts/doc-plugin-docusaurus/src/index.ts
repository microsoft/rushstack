// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IApiDocumenterPluginManifest } from '@microsoft/api-documenter';
import { DocusaurusMarkdownFeature } from './DocusaurusMarkdownFeature';

export const apiDocumenterPluginManifest: IApiDocumenterPluginManifest = {
  manifestVersion: 1000,
  features: [
    {
      featureName: 'docusaurus-markdown-documenter',
      kind: 'MarkdownDocumenterFeature',
      subclass: DocusaurusMarkdownFeature
    }
  ]
};
