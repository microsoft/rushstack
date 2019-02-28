// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export const enum ExtractorMessageId {
  /**
   * The doc comment should not contain more than one release tag.
   */
  ExtraReleaseTag = 'ae-extra-release-tag',

  /**
   * This symbol has another declaration with a different release tag.
   */
  InconsistentReleaseTags = 'ae-inconsistent-release-tags',

  /**
   * The doc comment should not contain more than one release tag.
   */
  MissingReleaseTag = 'ae-missing-release-tag',

  /**
   * The @packageDocumentation comment must appear at the top of entry point *.d.ts file.
   */
  MisplacedPackageTag = 'ae-misplaced-package-tag'
}
