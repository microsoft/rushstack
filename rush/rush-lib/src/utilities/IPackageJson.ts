// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Represents an NPM "package.json" file.
 * @public
 */
interface IPackageJson {
  /**
   * The package name
   */
  name: string;
  /**
   * The package version
   */
  version: string;

  /**
   * The package description.  On the NPM web site, this will be shown as a subtitle,
   * below the package name, above the README.md excerpt.
   */
  description?: string;

  /**
   * The regular packages that this package depends on.
   */
  dependencies?: { [key: string]: string };

  /**
   * The development-only packages that this package depends on.
   */
  devDependencies?: { [key: string]: string };

  /**
   * If a failure occurs (e.g. OS incompatibility) occurs while installing these
   * dependencies, it should bet treated as a warning rather than as an error.
   */
  optionalDependencies?: { [key: string]: string };

  /**
   * Whether this package may be published using the "npm publish" command.
   * Private packages are never published.
   */
  private?: boolean;

  /**
   * A table of script actions, e.g. a postinstall script, or an "npm run" macro.
   */
  scripts?: { [key: string]: string };

  /**
   * Access to other user-defined data fields.
   */
  [key: string]: any; // tslint:disable-line:no-any
}

export default IPackageJson;
