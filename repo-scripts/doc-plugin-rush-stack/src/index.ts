// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IApiDocumenterPluginManifest } from '@microsoft/api-documenter';

import { RushStackFeature } from './RushStackFeature';

export const apiDocumenterPluginManifest: IApiDocumenterPluginManifest = {
  manifestVersion: 1000,
  features: [
    {
      featureName: 'rush-stack-markdown-documenter',
      kind: 'MarkdownDocumenterFeature',
      subclass: RushStackFeature
    }
  ]
};
