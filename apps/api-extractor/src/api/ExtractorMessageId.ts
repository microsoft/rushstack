// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Unique identifiers for messages reported by API Extractor during its analysis.
 *
 * @remarks
 *
 * These strings are possible values for the {@link ExtractorMessage.messageId} property
 * when the `ExtractorMessage.category` is {@link ExtractorMessageCategory.Extractor}.
 *
 * @public
 */
export const enum ExtractorMessageId {
  /**
   * "The doc comment should not contain more than one release tag."
   */
  ExtraReleaseTag = 'ae-extra-release-tag',

  /**
   * "This symbol has another declaration with a different release tag."
   */
  DifferentReleaseTags = 'ae-different-release-tags',

  /**
   * "The symbol ___ is marked as ___, but its signature references ___ which is marked as ___."
   */
  IncompatibleReleaseTags = 'ae-incompatible-release-tags',

  /**
   * "___ is exported by the package, but it is missing a release tag (`@alpha`, `@beta`, `@public`, or `@internal`)."
   */
  MissingReleaseTag = 'ae-missing-release-tag',

  /**
   * "The `@packageDocumentation` comment must appear at the top of entry point *.d.ts file."
   */
  MisplacedPackageTag = 'ae-misplaced-package-tag',

  /**
   * "The symbol ___ needs to be exported by the entry point ___."
   */
  ForgottenExport = 'ae-forgotten-export',

  /**
   * "The name ___ should be prefixed with an underscore because the declaration is marked as `@internal`."
   */
  InternalMissingUnderscore = 'ae-internal-missing-underscore'
}

export const allExtractorMessageIds: Set<string> = new Set<string>([
  'ae-extra-release-tag',
  'ae-different-release-tags',
  'ae-incompatible-release-tags',
  'ae-missing-release-tag',
  'ae-misplaced-package-tag',
  'ae-forgotten-export',
  'ae-internal-missing-underscore'
]);
