// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  MarkdownDocumenterFeature,
  PluginInitialization
} from './MarkdownDocumenterFeature';

export interface IFeatureDefinition {
  /**
   * The name of this feature, as it will appear in the config file.
   *
   * The name should consist of one or more words separated by hyphens.  Each word should consist of lower case
   * letters and numbers.  Example: `my-feature`
   */
  featureName: string;

  /**
   * The name of the feature base class.
   */
  kind: 'MarkdownDocumenterFeature';

  /**
   * Your subclass that extends from the base class.
   */
  subclass: { new(initialization: PluginInitialization): MarkdownDocumenterFeature };
}

/**
 *
 */
export interface IApiDocumenterPluginManifest {
  manifestVersion: 1000;

  features: IFeatureDefinition[];
}
