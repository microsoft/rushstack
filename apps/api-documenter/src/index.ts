// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * API Documenter generates an API reference website from the .api.json files created by API Extractor.
 * The `@microsoft/api-documenter` package provides the command-line tool.  It also exposes a developer API that you
 * can use to create plugins that customize how API Documenter generates documentation.
 *
 * @packageDocumentation
 */

export type {
  IFeatureDefinition,
  IApiDocumenterPluginManifest
} from './plugin/IApiDocumenterPluginManifest.ts';
export { MarkdownDocumenterAccessor } from './plugin/MarkdownDocumenterAccessor.ts';
export {
  MarkdownDocumenterFeatureContext,
  type IMarkdownDocumenterFeatureOnBeforeWritePageArgs,
  type IMarkdownDocumenterFeatureOnFinishedArgs,
  MarkdownDocumenterFeature
} from './plugin/MarkdownDocumenterFeature.ts';
export { PluginFeature, PluginFeatureContext, PluginFeatureInitialization } from './plugin/PluginFeature.ts';
