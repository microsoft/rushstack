// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This interface is part of the IPackageJson file format.  It is used for the
 * "dependencies", "optionalDependencies", and "devDependencies" fields.
 * @public
 */
export interface IPackageJsonDependencyTable {
  /**
   * The key is the name of a dependency.  The value is a Semantic Versioning (SemVer)
   * range specifier.
   */
  [dependencyName: string]: string;
}

/**
 * This interface is part of the IPackageJson file format.  It is used for the
 * "scripts" field.
 * @public
 */
export interface IPackageJsonScriptTable {
  /**
   * The key is the name of the script hook.  The value is the script body which may
   * be a file path or shell script command.
   */
  [scriptName: string]: string;
}

/**
 * This interface is part of the IPackageJson file format.  It is used for the
 * "tsdoc" field.
 * @beta
 */
export interface IPackageJsonTsdocConfiguration {
  /**
   * A token indicating the dialect of TSDoc syntax used by *.d.ts files in this
   * package.
   */
  tsdocFlavor?: string;
}

/**
 * An interface for accessing common fields from a package.json file.
 *
 * @remarks
 * More fields may be added to this interface in the future.  Most fields are optional.
 * For documentation about this file format, see the
 * {@link http://wiki.commonjs.org/wiki/Packages/1.0 | CommonJS Packages specification}
 * and the {@link https://docs.npmjs.com/files/package.json | NPM manual page}.
 * @public
 */
export interface IPackageJson {
  /**
   * The name of the package.
   */
  name: string;

  /**
   * A version number conforming to the Semantic Versioning (SemVer) standard.
   */
  version?: string;

  /**
   * Indicates whether this package is allowed to be published or not.
   */
  private?: boolean;

  /**
   * A brief description of the package.
   */
  description?: string;

  /**
   * The URL of the project's repository.
   */
  repository?: string;

  /**
   * The URL to the project's web page.
   */
  homepage?: string;

  /**
   * The name of the license.
   */
  license?: string;

  /**
   * The path to the module file that will act as the main entry point.
   */
  main?: string;

  /**
   * The path to the TypeScript *.d.ts file describing the module file
   * that will act as the main entry point.
   */
  types?: string;

  /**
   * Alias for `types`
   */
  typings?: string;

  /**
   * Describes the documentation comment syntax used for the *.d.ts files
   * exposed by this package.
   * @beta
   */
  tsdoc?: IPackageJsonTsdocConfiguration;

  /**
   * The path to the TSDoc metadata file.
   * This is still being standardized: https://github.com/Microsoft/tsdoc/issues/7#issuecomment-442271815
   * @beta
   */
  tsdocMetadata?: string;

  /**
   * The main entry point for the package.
   */
  bin?: string;

  /**
   * An array of dependencies that must always be installed for this package.
   */
  dependencies?: IPackageJsonDependencyTable;

  /**
   * An array of optional dependencies that may be installed for this package.
   */
  optionalDependencies?: IPackageJsonDependencyTable;

  /**
   * An array of dependencies that must only be installed for developers who will
   * build this package.
   */
  devDependencies?: IPackageJsonDependencyTable;

  /**
   * An array of dependencies that must be installed by a consumer of this package,
   * but which will not be automatically installed by this package.
   */
  peerDependencies?: IPackageJsonDependencyTable;

  /**
   * A table of script hooks that a package manager or build tool may invoke.
   */
  scripts?: IPackageJsonScriptTable;
}
