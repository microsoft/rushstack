// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
  * A "release tag" is an AEDoc tag which indicates whether an AstItem definition
  * is considered Public API for third party developers, as well as its release
  * stage (alpha, beta, etc).
  * @see https://onedrive.visualstudio.com/DefaultCollection/SPPPlat/_git/sp-client
  *      ?path=/common/docs/ApiPrinciplesAndProcess.md
  */
export enum ReleaseTag {
  /**
   * No release tag was specified in the AEDoc summary.
   */
  None = 0,
  /**
   * Indicates that an API item is meant only for usage by other NPM packages from the same
   * maintainer. Third parties should never use "internal" APIs. (To emphasize this, their
   * names are prefixed by underscores.)
   */
  Internal = 1,
  /**
   * Indicates that an API item is eventually intended to be public, but currently is in an
   * early stage of development. Third parties should not use "alpha" APIs.
   */
  Alpha = 2,
  /**
   * Indicates that an API item has been released in an experimental state. Third parties are
   * encouraged to try it and provide feedback. However, a "beta" API should NOT be used
   * in production.
   */
  Beta = 3,
  /**
   * Indicates that an API item has been officially released. It is part of the supported
   * contract (e.g. SemVer) for a package.
   */
  Public = 4
}
