// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { MarkdownDocumenterFeature } from './MarkdownDocumenterFeature';
import { PluginFeatureInitialization } from './PluginFeature';

/**
 * Defines a "feature" that is provided by an API Documenter plugin.  A feature is a user-defined module
 * that customizes the behavior of API Documenter.
 *
 * @public
 */
export interface IFeatureDefinition {
  /**
   * The name of this feature, as it will appear in the config file.
   *
   * The name should consist of one or more words separated by hyphens.  Each word should consist of lower case
   * letters and numbers.  Example: `my-feature`
   */
  featureName: string;

  /**
   * Determines the kind of feature.  The specified value is the name of the base class that `subclass` inherits from.
   *
   * @remarks
   * For now, `MarkdownDocumenterFeature` is the only supported value.
   */
  kind: 'MarkdownDocumenterFeature';

  /**
   * Your subclass that extends from the base class.
   */
  subclass: { new (initialization: PluginFeatureInitialization): MarkdownDocumenterFeature };
}

/**
 * The manifest for an API Documenter plugin.
 *
 * @remarks
 * An API documenter plugin is an NPM package. By convention, the NPM package name should have the prefix
 * `doc-plugin-`.  Its main entry point should export an object named `apiDocumenterPluginManifest` which implements
 * the `IApiDocumenterPluginManifest` interface.
 *
 * For example:
 * ```ts
 * class MyMarkdownDocumenter extends MarkdownDocumenterFeature {
 *   public onInitialized(): void {
 *     console.log('MyMarkdownDocumenter: onInitialized()');
 *   }
 * }
 *
 * export const apiDocumenterPluginManifest: IApiDocumenterPluginManifest = {
 *   manifestVersion: 1000,
 *   features: [
 *     {
 *       featureName: 'my-markdown-documenter',
 *       kind: 'MarkdownDocumenterFeature',
 *       subclass: MyMarkdownDocumenter
 *     }
 *   ]
 * };
 * ```
 * @public
 */
export interface IApiDocumenterPluginManifest {
  /**
   * The manifest version number.  For now, this must always be `1000`.
   */
  manifestVersion: 1000;

  /**
   * The list of features provided by this plugin.
   */
  features: IFeatureDefinition[];
}
